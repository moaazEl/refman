'use strict';
// Explicit integration check: node tests/desktop-workflow.cjs
// The real Electron window, IPC routes, renderer and SQLite store run unchanged.
// Only native folder/restore dialog answers are stubbed. No GPT generation or Word write runs.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const appRoot=path.resolve(__dirname,'..');
const workRoot=path.resolve(appRoot,'../../work');
fs.mkdirSync(workRoot,{recursive:true});
const runRoot=fs.mkdtempSync(path.join(workRoot,'desktop-workflow-'));
const profile=path.join(runRoot,'profile');
const projectsRoot=path.join(runRoot,'projects');
fs.mkdirSync(projectsRoot,{recursive:true});
const alphaFolder=path.join(projectsRoot,'Workflow Alpha.refman');
const betaFolder=path.join(projectsRoot,'Workflow Beta.refman');
const results=[];
const errors=[];
let application,page;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label,timeout=15000) {
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline){try{if(await predicate())return;}catch(error){last=error;}await delay(100);}
  throw new Error(`Timed out waiting for ${label}${last?`: ${last.message}`:''}`);
}
function stored(folder=alphaFolder){return JSON.parse(fs.readFileSync(path.join(folder,'project.json'),'utf8'));}
async function storedUntil(predicate,label,folder=alphaFolder){await until(()=>predicate(stored(folder)),label);}
async function check(name,run){const start=Date.now();try{await run();results.push({name,passed:true,ms:Date.now()-start});console.log(`PASS ${name}`);}catch(error){results.push({name,passed:false,error:error.message,ms:Date.now()-start});throw error;}}
async function launch(){
  application=await electron.launch({...(process.env.REFMAN_EXECUTABLE?{executablePath:process.env.REFMAN_EXECUTABLE,args:[]}:{args:[appRoot]}),env:{...process.env,REFMAN_USER_DATA:profile},timeout:30000});
  await application.evaluate(({dialog},folder)=>{
    global.__refmanDialogCalls=[];global.__refmanNextFolder=null;
    dialog.showOpenDialog=async(_window,options)=>{global.__refmanDialogCalls.push({kind:'open',title:options?.title});return {canceled:false,filePaths:[global.__refmanNextFolder||folder]};};
    dialog.showSaveDialog=async(_window,options)=>{global.__refmanDialogCalls.push({kind:'save',title:options?.title});return {canceled:false,filePath:folder+'/reviewed-references.docx'};};
    dialog.showMessageBox=async(_window,options)=>{global.__refmanDialogCalls.push({kind:'message',message:options?.message});return {response:1};};
  },projectsRoot);
  page=await application.firstWindow();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#create-project').waitFor();
}
async function view(name){await page.locator(`.tab[data-view="${name}"]`).click();}
async function detail(name){await page.locator(`.detail-tabs [data-detail="${name}"]`).click();}
async function createProject(name){await page.locator('#create-project').click();await page.locator('#new-project-name').fill(name);await page.locator('#project-create-form button[type=submit]').click();await until(async()=>await page.locator('#project-title').textContent()===name,'created project title');}
async function openSource(number){await view('library');await page.locator(`#sources .source-row`).filter({has:page.locator('.source-number',{hasText:String(number).padStart(2,'0')})}).click();await until(async()=>await page.locator('#source-label').textContent()===`SOURCE ${String(number).padStart(2,'0')}`,'selected source');}
async function addManual(fields){await view('library');await page.locator('#add-source').click();await page.locator('#manual-source').click();await page.locator('#add-dialog').waitFor({state:'hidden'});await detail('metadata');for(const [name,value]of Object.entries(fields)){const field=page.locator(`#metadata-form [name="${name}"]`);if(name==='type')await field.selectOption(value);else await field.fill(value);}await save();}
async function save(){await page.locator('#save-project').click();await until(async()=>await page.locator('#save-status').textContent()==='Saved locally','local save');}
function included(number){return page.getByRole('checkbox',{name:`Include source ${number} in bibliography`,exact:true});}
async function importDuplicate(){await view('library');await page.locator('#add-source').click();await page.locator('#lookup-input').fill('10.9999/refman-desktop-workflow-test');await page.locator('#lookup-source').click();await page.locator('#confirm-dialog').waitFor({state:'visible',timeout:30000});}

(async()=>{
  try{
    await launch();
    await check('create project and editable source through native Electron/store',async()=>{
      await createProject('Workflow Alpha');
      await addManual({type:'journal',title:'Zulu evidence',authorsText:'Zebra, Zane',year:'2020',container:'Journal of Original CASE',volume:'4',issue:'2',pages:'10–20',doi:'10.9999/refman-desktop-workflow-test'});
      const p=stored();assert.equal(p.name,'Workflow Alpha');assert.equal(p.sources.length,1);assert.equal(p.sources[0].number,1);assert.equal(p.sources[0].include,false);assert.equal(p.sources[0].type,'journal');assert.deepEqual(p.sources[0].authors,[{family:'Zebra',given:'Zane'}]);
      assert.ok(fs.existsSync(path.join(alphaFolder,'project.sqlite')));assert.match(fs.readFileSync(path.join(alphaFolder,'project.txt'),'utf8'),/Zulu evidence/);
    });
    await check('metadata preview and notes persist after source switches',async()=>{
      await detail('reading');await page.locator('#source-notes').fill('Source one private note');await page.locator('#source-content').fill('Passage copied from source one.');await save();
      await detail('preview');await until(async()=>(await page.locator('#reference-preview').textContent()).includes('Zebra, Z.'),'APA preview');assert.equal(await page.locator('#parenthetical-preview').textContent(),'(Zebra, 2020)');assert.equal(await page.locator('#narrative-preview').textContent(),'Zebra (2020)');assert.match(await page.locator('#reference-preview').textContent(),/Journal of Original CASE, 4\(2\), 10–20/);
      await addManual({type:'book',title:'Brown evidence',authorsText:'Brown, Blair',year:'2021',publisher:'Example Press'});
      await addManual({type:'book',title:'Young evidence',authorsText:'Young, Yara',year:'2022',publisher:'Example Press'});
      await openSource(1);await detail('reading');assert.equal(await page.locator('#source-notes').inputValue(),'Source one private note');assert.equal(await page.locator('#source-content').inputValue(),'Passage copied from source one.');assert.equal(stored().sources.length,3);
    });
    await check('include checkboxes survive autosave and refresh without selecting excluded records',async()=>{
      await included(1).check();await storedUntil(p=>p.sources.find(s=>s.number===1).include===true,'source one include autosave');assert.equal(await included(1).isChecked(),true);
      await included(2).check();await storedUntil(p=>p.sources.find(s=>s.number===2).include===true,'source two include autosave');await included(1).uncheck();await storedUntil(p=>p.sources.find(s=>s.number===1).include===false,'source one exclusion autosave');
      await openSource(2);assert.equal(await included(1).isChecked(),false);assert.equal(await included(2).isChecked(),true);assert.equal(await included(3).isChecked(),false);
      await included(1).check();await storedUntil(p=>p.sources.find(s=>s.number===1).include===true,'include restored');assert.equal(await page.locator('#included-count').textContent(),'2 included in bibliography');
    });
    await check('multi-source citations alphabetise and bibliography excludes unselected sources',async()=>{
      await view('citations');await page.locator('#citation-sources label').filter({hasText:'Zulu evidence'}).locator('input').check();await page.locator('#citation-sources label').filter({hasText:'Brown evidence'}).locator('input').check();await until(async()=>await page.locator('#combined-output').textContent()==='(Brown, 2021; Zebra, 2020)','combined APA order');
      await page.locator('#refresh-bibliography').click();await until(async()=>(await page.locator('#bibliography-preview').textContent()).includes('Brown, B.'),'bibliography refresh');
      const text=await page.locator('#bibliography-preview').textContent();assert.ok(text.indexOf('Brown, B.')<text.indexOf('Zebra, Z.'));assert.doesNotMatch(text,/Young evidence/);
    });
    await check('project brief saves and publication boundaries are inclusive',async()=>{
      await view('brief');for(const [name,value]of Object.entries({question:'What supports this argument?',rubric:'Use original evidence',draft:'Initial essay draft',minYear:'2020',maxYear:'2022',rules:'APA 7; evaluate source relevance'}))await page.locator(`#brief-form [name="${name}"]`).fill(value);await save();
      const p=stored();assert.equal(p.question,'What supports this argument?');assert.equal(p.minYear,2020);assert.equal(p.maxYear,2022);
      for(const number of [1,3]){await openSource(number);assert.doesNotMatch(await page.locator('#source-warnings').textContent(),/predates|outside your project date range/);}
      await openSource(1);await detail('metadata');await page.locator('#metadata-form [name=year]').fill('2019');assert.match(await page.locator('#source-warnings').textContent(),/predates/);await page.locator('#metadata-form [name=year]').fill('2023');assert.match(await page.locator('#source-warnings').textContent(),/outside/);await page.locator('#metadata-form [name=year]').fill('2020');assert.doesNotMatch(await page.locator('#source-warnings').textContent(),/predates|outside/);await save();
    });
    await check('source deletion asks confirmation and permanently preserves numbering',async()=>{
      await openSource(2);await page.locator('#source-menu').click();await page.locator('#confirm-cancel').click();assert.equal(stored().sources.length,3);
      await page.locator('#source-menu').click();await page.locator('#confirm-accept').click();await storedUntil(p=>p.sources.length===2,'source deletion');assert.deepEqual(stored().sources.map(s=>s.number),[1,3]);
      await addManual({type:'book',title:'Fourth evidence',authorsText:'Adams, Avery',year:'2021',publisher:'Example Press'});assert.deepEqual(stored().sources.map(s=>s.number),[1,3,4]);
    });
    await check('duplicate DOI asks skip/keep confirmation and defaults new records to excluded',async()=>{
      await importDuplicate();assert.match(await page.locator('#confirm-text').textContent(),/Source 1/);await page.locator('#confirm-cancel').click();await until(async()=>await page.locator('#toast').textContent()==='Duplicate skipped. Your existing source is unchanged.','duplicate skip');assert.equal(stored().sources.length,3);
      if(await page.locator('#add-dialog').isVisible())await page.locator('#add-dialog .dialog-close').click();
      await importDuplicate();await page.locator('#confirm-accept').click();await storedUntil(p=>p.sources.length===4,'keep separate duplicate');assert.deepEqual(stored().sources.map(s=>s.number),[1,3,4,5]);assert.equal(stored().sources.at(-1).include,false);assert.equal(stored().sources.at(-1).doi,'10.9999/refman-desktop-workflow-test');
    });
    await check('unsaved source edits flush on project switches; project content stays separate',async()=>{
      await openSource(1);await detail('reading');await page.locator('#source-notes').fill('Edited immediately before project switch');
      await createProject('Workflow Beta');await addManual({type:'book',title:'Beta project only',authorsText:'Beta, Brooke',year:'2025',publisher:'Beta Press'});assert.equal(stored(betaFolder).sources.length,1);assert.equal(stored().sources.find(s=>s.number===1).notes,'Edited immediately before project switch');
      await page.locator('#projects .project-item').filter({hasText:'Workflow Alpha'}).click();await until(async()=>await page.locator('#project-title').textContent()==='Workflow Alpha','switch back to Alpha');assert.equal(await page.locator('#source-count').textContent(),'4');await detail('reading');assert.equal(await page.locator('#source-notes').inputValue(),'Edited immediately before project switch');assert.doesNotMatch(await page.locator('#sources').textContent(),/Beta project only/);
    });
    await check('UI backup restore restores chosen saved version and preserves current version',async()=>{
      await page.locator('#source-notes').fill('Restore target note');await save();await page.locator('#source-notes').fill('Newer note before restore');await save();
      const versionFolder=path.join(alphaFolder,'versions');const version=fs.readdirSync(versionFolder).filter(name=>name.endsWith('.json')).find(name=>JSON.parse(fs.readFileSync(path.join(versionFolder,name),'utf8')).sources.find(s=>s.number===1)?.notes==='Restore target note');assert.ok(version,'Expected backup exists');
      await page.locator('#backup-open').click();await page.locator('#backup-dialog').waitFor({state:'visible'});await page.locator('#backups-list .backup-row').filter({hasText:version}).getByRole('button',{name:'Restore',exact:true}).click();await page.locator('#backup-dialog').waitFor({state:'hidden'});await storedUntil(p=>p.sources.find(s=>s.number===1).notes==='Restore target note','restored project persisted');await detail('reading');assert.equal(await page.locator('#source-notes').inputValue(),'Restore target note');
      assert.ok(fs.readdirSync(versionFolder).some(name=>name.endsWith('.json')&&JSON.parse(fs.readFileSync(path.join(versionFolder,name),'utf8')).sources.find(s=>s.number===1)?.notes==='Newer note before restore'));
      const nativeCalls=await application.evaluate(()=>global.__refmanDialogCalls);assert.ok(nativeCalls.some(call=>call.kind==='message'&&/Restore/.test(call.message)));
    });
    await check('restart reopens recent project with persisted sources, notes and include flags',async()=>{
      await page.screenshot({path:path.join(runRoot,'workflow-before-restart.png'),fullPage:true});await application.close();application=null;await launch();await page.locator('#projects .project-item').filter({hasText:'Workflow Alpha'}).waitFor();await page.locator('#projects .project-item').filter({hasText:'Workflow Alpha'}).click();await until(async()=>await page.locator('#project-title').textContent()==='Workflow Alpha','reopen saved project');
      assert.equal(await page.locator('#source-count').textContent(),'4');assert.deepEqual(stored().sources.map(s=>s.number),[1,3,4,5]);assert.equal(await included(1).isChecked(),true);assert.equal(await included(3).isChecked(),false);await detail('reading');assert.equal(await page.locator('#source-notes').inputValue(),'Restore target note');
      await view('brief');assert.equal(await page.locator('#brief-form [name=question]').inputValue(),'What supports this argument?');assert.equal(await page.locator('#brief-form [name=minYear]').inputValue(),'2020');assert.equal(await page.locator('#brief-form [name=maxYear]').inputValue(),'2022');await page.screenshot({path:path.join(runRoot,'workflow-after-restart.png'),fullPage:true});
    });
    await check('evidence dialog deduplicates stored provenance and marks edited values safely',async()=>{
      const {Store}=require('../src/store.cjs');const folder=path.join(projectsRoot,'Evidence Review.refman');const fixtureStore=new Store(folder);let fixture=await fixtureStore.create('Evidence Review');
      const checkedAt='2025-01-02T03:04:05.000Z';
      const titleEvidence={field:'title',value:'Imported title <script>never execute</script>',provider:'Synthetic QA provenance',url:'https://example.org/source',checkedAt,status:'verified',note:'Synthetic stored fixture; not a real imported publication.'};
      const authorEvidence={field:'authors',value:[{family:'Fixture',given:'Frances'}],provider:'Synthetic QA provenance',url:'https://example.org/byline',checkedAt,status:'verified'};
      const failedEvidence={field:'year',value:'2021',provider:'Synthetic failed check',url:'javascript:neverExecute()',checkedAt,status:'unverified',note:'Unverified year requires review.'};
      const records=[titleEvidence,authorEvidence,failedEvidence,'Legacy imported record'];
      fixture.minYear=2020;fixture.maxYear=2022;fixture.sources=[{id:'evidence-fixture',number:1,type:'book',title:'Edited evidence title',authors:[{family:'Fixture',given:'Frances'}],year:'2021',publisher:'Fixture Press',include:true,notes:'Clearly labelled test fixture',summary:'Synthetic QA summary; no model inference was run.',summaryContext:require('node:crypto').createHash('sha256').update([fixture.question,fixture.rubric,fixture.draft].join('\n')).digest('hex'),summaryNeedsRefresh:false,attachments:[],history:[],overrides:{},missing:[],evidence:records,verification:records}];fixture.nextSourceNumber=2;await fixtureStore.save(fixture);
      await application.evaluate((_electron,folder)=>{global.__refmanNextFolder=folder;},folder);await page.locator('#open-project').click();await until(async()=>await page.locator('#project-title').textContent()==='Evidence Review','open provenance fixture through native folder chooser');
      await view('library');assert.match(await page.locator('#source-verification').textContent(),/4 evidence records/);await page.locator('#view-evidence').click();await page.locator('#evidence-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#evidence-list .evidence-record').count(),4);assert.equal(await page.locator('#evidence-list .evidence-edited').count(),1);
      assert.match(await page.locator('#evidence-list').textContent(),/Imported title <script>never execute<\/script>/);assert.match(await page.locator('#evidence-list').textContent(),/Fixture, Frances/);assert.match(await page.locator('#evidence-list').textContent(),/Unverified year requires review/);assert.match(await page.locator('#evidence-list').textContent(),/Legacy imported record/);assert.equal(await page.locator('#evidence-list script').count(),0);assert.equal(await page.locator('#evidence-list a').count(),2);assert.deepEqual(await page.locator('#evidence-list a').evaluateAll(links=>links.map(link=>link.href)),['https://example.org/source','https://example.org/byline']);await page.screenshot({path:path.join(runRoot,'evidence-dialog.png'),fullPage:true});await page.locator('#evidence-dialog .dialog-close').click();
    });
    await check('failed verification warnings require explicit review before copy/export/Word actions',async()=>{
      await view('citations');await until(async()=>await page.locator('#bibliography-warnings').isVisible(),'bibliography warnings');assert.match(await page.locator('#bibliography-warnings').textContent(),/Review 1 source before using this list/);assert.match(await page.locator('#bibliography-warnings').textContent(),/Unverified year requires review/);
      const beforeClipboard=await application.evaluate(({clipboard})=>clipboard.readText());await page.locator('#copy-bibliography').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#confirm-title').textContent(),'Review reference warnings');assert.equal(await page.locator('#confirm-accept').textContent(),'Copy reviewed list');assert.match(await page.locator('#confirm-text').textContent(),/Unverified year requires review/);await page.locator('#confirm-cancel').click();await until(async()=>await page.locator('#copy-bibliography').isEnabled(),'copy cancel complete');assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),beforeClipboard);
      const savesBefore=await application.evaluate(()=>global.__refmanDialogCalls.filter(call=>call.kind==='save').length);await page.locator('#export-docx').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#confirm-accept').textContent(),'Export reviewed list');await page.locator('#confirm-cancel').click();await until(async()=>await page.locator('#export-docx').isEnabled(),'export cancel complete');assert.equal(await application.evaluate(()=>global.__refmanDialogCalls.filter(call=>call.kind==='save').length),savesBefore);
      await page.locator('#update-word').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#confirm-accept').textContent(),'Update reviewed references');await page.locator('#confirm-cancel').click();await until(async()=>await page.locator('#update-word').isEnabled(),'Word action canceled before invocation');
      await page.locator('#export-docx').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.screenshot({path:path.join(runRoot,'reference-review-dialog.png'),fullPage:true});await page.locator('#confirm-accept').click();const exportPath=path.join(projectsRoot,'reviewed-references.docx');await until(()=>fs.existsSync(exportPath),'reviewed DOCX export');assert.equal(fs.readFileSync(exportPath).subarray(0,2).toString(),'PK');assert.equal(await application.evaluate(()=>global.__refmanDialogCalls.filter(call=>call.kind==='save').length),savesBefore+1);
      await page.locator('#bibliography-warnings').getByRole('button',{name:'Review source ↗',exact:true}).click();await until(async()=>await page.locator('.tab[data-view=library]').getAttribute('class')==='tab active','review link opens Sources');assert.equal(await page.locator('#source-title').textContent(),'Edited evidence title');
    });
    await check('partial proposal override keeps saved citation overrides and correction history via real IPC',async()=>{
      const folder=path.join(projectsRoot,'Evidence Review.refman');await view('library');await detail('preview');await page.locator('#override-reference').fill('Original reference override');await page.locator('#override-parenthetical').fill('(Fixture override, 2021)');await page.locator('#override-narrative').fill('Fixture override (2021)');await save();
      const returned=await page.evaluate(async()=>window.refman.invoke('applyProposal',{proposal:{sourceId:'evidence-fixture',changes:{overrides:{reference:'Corrected reference'}},reason:'Synthetic QA partial override proposal'}}));
      const source=returned.sources.find(item=>item.id==='evidence-fixture');assert.deepEqual(source.overrides,{reference:'Corrected reference',parenthetical:'(Fixture override, 2021)',narrative:'Fixture override (2021)'});const correction=source.history.at(-1);assert.equal(correction.reason,'Synthetic QA partial override proposal');assert.deepEqual(correction.before.overrides,{reference:'Original reference override',parenthetical:'(Fixture override, 2021)',narrative:'Fixture override (2021)'});assert.equal(correction.changes.overrides.reference,'Corrected reference');assert.deepEqual(stored(folder).sources[0].overrides,source.overrides);
      await page.locator('#open-project').click();await until(async()=>await page.locator('#override-reference').inputValue()==='Corrected reference','reloaded corrected override');await detail('preview');await until(async()=>await page.locator('#reference-preview').textContent()==='Corrected reference','corrected reference preview');assert.equal(await page.locator('#parenthetical-preview').textContent(),'(Fixture override, 2021)');assert.equal(await page.locator('#narrative-preview').textContent(),'Fixture override (2021)');await detail('history');assert.match(await page.locator('#source-history').textContent(),/Synthetic QA partial override proposal/);
    });
    await check('saved brief changes mark a contextual summary stale and display a warning without GPT',async()=>{
      const folder=path.join(projectsRoot,'Evidence Review.refman');await detail('reading');assert.equal(stored(folder).sources[0].summaryNeedsRefresh,false);assert.equal(await page.locator('#summary-warning').isVisible(),false);assert.equal(await page.locator('#source-summary').inputValue(),'Synthetic QA summary; no model inference was run.');
      await view('brief');await page.locator('#brief-form [name=question]').fill('A revised research question requiring a fresh summary');await save();assert.equal(stored(folder).sources[0].summaryNeedsRefresh,true);await view('library');await detail('reading');assert.equal(await page.locator('#summary-warning').isVisible(),true);assert.match(await page.locator('#summary-warning').textContent(),/assignment context has changed/);assert.equal(await page.locator('#source-summary').inputValue(),'Synthetic QA summary; no model inference was run.');await page.screenshot({path:path.join(runRoot,'stale-summary-warning.png'),fullPage:true});
      await save();assert.equal(stored(folder).sources[0].summaryNeedsRefresh,true);await view('brief');await page.locator('#brief-form [name=question]').fill('');await save();assert.equal(stored(folder).sources[0].summaryNeedsRefresh,false);await view('library');await detail('reading');assert.equal(await page.locator('#summary-warning').isVisible(),false);
    });
    await check('renderer emits no uncaught errors throughout workflow',async()=>assert.deepEqual(errors,[]));
  }catch(error){console.error(error.stack||error);if(page)try{await page.screenshot({path:path.join(runRoot,'failure.png'),fullPage:true});}catch{}process.exitCode=1;}
  finally{
    const report={passed:!process.exitCode,results,rendererErrors:errors,runRoot,projectsRoot,profile,limitations:['Native folder/restore dialogs answered deterministically.','No GPT generation, Word write or third-party account changes; reviewed DOCX is exported only into the disposable work folder.','Duplicate DOI path makes read-only registry requests; registry failure is an expected incomplete record.'],finishedAt:new Date().toISOString()};
    fs.writeFileSync(path.join(runRoot,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,steps:results.length,report:path.join(runRoot,'report.json')}));if(application)await application.close();
  }
})();
