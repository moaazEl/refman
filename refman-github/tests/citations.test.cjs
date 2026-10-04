'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {formatSource,bibliography,combined}=require('../src/citations.cjs');
const {lookupSource,parseHtml,normalizeUrl,normalizeDoi,publicIp}=require('../src/intake.cjs');
const author=(family,given='Alex')=>({family,given});
const book=(id,title,year='2020',authors=[author('Jones')])=>({id,type:'book',title,year,authors,publisher:'Example Press',include:true});
const mockOptions=(body,contentType='text/html')=>({resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>({status:200,headers:{get:name=>name==='content-type'?contentType:''},text:async()=>body})});

test('Griffith journal example: authors, punctuation, journal/volume italics and DOI',()=>{
  const source={id:'mantie',type:'article',authors:[author('Mantie','Roger')],year:'2013',title:'A comparison of "popular music pedagogy" discourses',container:'Journal of Research in Music Education',volume:'61',issue:'3',pages:'334-352',doi:'doi:10.1177/0022429413497235',url:'https://example.org/unnecessary'};
  const result=formatSource(source);
  assert.equal(result.reference,'Mantie, R. (2013). A comparison of "popular music pedagogy" discourses. Journal of Research in Music Education, 61(3), 334–352. https://doi.org/10.1177/0022429413497235');
  assert.match(result.referenceHtml,/<i>Journal of Research in Music Education<\/i>, <i>61<\/i>\(3\)/);
  assert.equal(result.parenthetical,'(Mantie, 2013)');assert.equal(result.narrative,'Mantie (2013)');assert.deepEqual(result.warnings,[]);
});
test('Griffith book example and hyphenated author initials',()=>{
  const s={...book('a','Human caring science: A theory of nursing','2012',[author('Watson','Jean')]),edition:'2',publisher:'Jones & Bartlett Learning'};
  assert.equal(formatSource(s).reference,'Watson, J. (2012). Human caring science: A theory of nursing (2nd ed.). Jones & Bartlett Learning.');
  const article={...s,type:'article',authors:[author('Bartleet','Brydie-Leigh'),author('Bennett','Dawn')],container:'Journal',volume:'1',edition:''};
  assert.match(formatSource(article).reference,/Bartleet, B.-L., & Bennett, D./);
  assert.equal(formatSource(article).parenthetical,'(Bartleet & Bennett, 2012)');assert.equal(formatSource(article).narrative,'Bartleet and Bennett (2012)');
});
test('twenty-one authors: first nineteen, ellipsis, final author; three+ et al. from first citation',()=>{
  const s=book('a','Many authors','2020',Array.from({length:21},(_,i)=>author(`Writer${i+1}`)));
  const result=formatSource(s);assert.match(result.reference,/Writer19, A., \. \. \. Writer21, A./);assert.doesNotMatch(result.reference,/Writer20|& Writer21/);
  assert.equal(result.firstParenthetical,'(Writer1 et al., 2020)');
});
test('same authors/year suffixes use alphabetic title order ignoring A/An/The',()=>{
  const z=book('z','The Zebra'),a=book('a','An Apple');const project={sources:[z,a]};
  assert.equal(formatSource(a,project).parenthetical,'(Jones, 2020a)');assert.equal(formatSource(z,project).parenthetical,'(Jones, 2020b)');
  a.year='';z.year='';assert.equal(formatSource(a,project).parenthetical,'(Jones, n.d.-a)');
  assert.match(formatSource(a,project).reference,/\(n.d.-a\)/);
});
test('et-al collisions expand author lists and author surname ambiguity adds initials',()=>{
  const a=book('a','One','2020',[author('Carter'),author('Brown'),author('Murphy'),author('Harris'),author('Green')]);
  const b=book('b','Two','2020',[author('Carter'),author('Brown'),author('Lopez'),author('Fox'),author('Patel')]);
  const p={sources:[a,b]};assert.equal(formatSource(a,p).parenthetical,'(Carter, Brown, Murphy, et al., 2020)');
  const j=book('j','Three','2020',[author('Smith','Jane')]),k=book('k','Four','2021',[author('Smith','John')]);
  assert.equal(formatSource(j,{sources:[j,k]}).parenthetical,'(J. Smith, 2020)');
});
test('corporate first/subsequent citations and omission of repeated publisher',()=>{
  const s={...book('a','World health'),authors:[{literal:'World Health Organization'}],publisher:'World Health Organization',abbreviation:'WHO'};
  const r=formatSource(s);assert.equal(r.firstParenthetical,'(World Health Organization [WHO], 2020)');assert.equal(r.firstNarrative,'World Health Organization (WHO, 2020)');assert.equal(r.parenthetical,'(WHO, 2020)');
  assert.equal((r.reference.match(/World Health Organization/g)||[]).length,1);
});
test('Griffith UpToDate no-author entry quotes title, italicises database and includes retrieval',()=>{
  const r=formatSource({id:'a',type:'uptodate',authors:[],year:'2020',title:'Amiloride: Drug information',retrieved:'2020-05-14',url:'https://www.uptodate.com/contents/amiloride-drug-information'});
  assert.equal(r.reference,'Amiloride: Drug information. (2020). UpToDate. Retrieved May 14, 2020, from https://www.uptodate.com/contents/amiloride-drug-information');
  assert.match(r.referenceHtml,/<i>UpToDate<\/i>/);assert.doesNotMatch(r.referenceHtml,/<i>Amiloride/);assert.equal(r.parenthetical,'(“Amiloride: Drug Information”, 2020)');
  assert.match(formatSource({type:'amh',title:'Acarbose',year:'2020'}).warnings.join(' '),/retrieval date/);
});
test('Griffith Cochrane differs from general journal: database rather than volume/pages',()=>{
  const r=formatSource({type:'cochrane',authors:[author('Roaldsen','Marianne B.'),author('Lindekleiv','Haakon'),author('Mathiesen','Ellisiv B.'),author('Berge','Eivind')],year:'2018',title:'Recanalisation therapies for wake-up stroke',volume:'2018',issue:'8',pages:'CD010995',doi:'10.1002/14651858.CD010995.pub2'});
  assert.match(r.reference,/Cochrane Database of Systematic Reviews\. https:\/\/doi.org\//);assert.doesNotMatch(r.reference,/2018\(8\)/);
});
test('Griffith Australian acts, bills and reported cases use legal patterns',()=>{
  const act={type:'legislation',title:'Aboriginal Land Rights Act',year:'1983',jurisdiction:'NSW',subdivision:'s 36AA',country:'Austl.',url:'https://www.legislation.nsw.gov.au/#/view/act/1983/42/part2/div2/sec36aa'};
  const r=formatSource(act);assert.match(r.reference,/Aboriginal Land Rights Act 1983 \(NSW\) s 36AA \(Austl.\)/);assert.equal(r.parenthetical,'(Aboriginal Land Rights Act 1983 (NSW), s 36AA)');
  const bill=formatSource({...act,type:'bill',title:'University Legislation Amendment Bill',year:'2017',jurisdiction:'Qld'});assert.doesNotMatch(bill.referenceHtml,/<i>/);
  const c=formatSource({type:'case',title:'Mabo v Queensland [No. 2]',year:'1992',volume:'175',container:'CLR',pages:'1, 5',country:'Austl.'});assert.equal(c.reference,'Mabo v Queensland [No. 2] (1992) 175 CLR 1, 5 (Austl.).');assert.match(c.referenceHtml,/<i>Mabo v Queensland/);
  assert.match(formatSource({type:'legislation',title:'Unknown Act',year:'2020'}).warnings.join(' '),/jurisdiction missing/);
});
test('bibliography sorts and excludes unselected sources; combined citations group years',()=>{
  const j2=book('j2','Later','2021'),b=book('b','Early','2020',[author('Brown')]),j1=book('j1','First','2019'),hidden=book('x','Hidden');hidden.include=false;
  const p={sources:[j2,hidden,j1,b]};const out=bibliography(p);assert.deepEqual(out.entries.map(e=>e.id),['b','j1','j2']);assert.match(out.html,/text-indent:-0.5in/);
  assert.equal(combined(['j2','b','j1','j1'],p),'(Brown, 2020; Jones, 2019, 2021)');
});
test('manual overrides are safely escaped, preserve literal text and leave unresolved warnings',()=>{
  const r=formatSource({title:'<script>bad</script>',type:'chapter',overrides:{reference:'Checked <entry> & text',parenthetical:'(Custom, 2020)',narrative:'Custom (2020)'}});
  assert.equal(r.reference,'Checked <entry> & text');assert.equal(r.referenceHtml,'Checked &lt;entry&gt; &amp; text');assert.equal(r.parenthetical,'(Custom, 2020)');assert.equal(r.firstParenthetical,r.parenthetical);assert.match(r.warnings.join(' '),/editors missing/);
});
test('DOI intake uses verified matching Crossref fields and publication not created timestamp',async()=>{
  const body=JSON.stringify({message:{DOI:'10.1234/example',type:'journal-article',title:['A <i>real</i> title'],author:[{family:'Smith',given:'Jamie'}],'container-title':['Journal'],volume:'10',issue:'2',page:'1-9',publisher:'Press',created:{'date-parts':[[2026,1,1]]},published:{'date-parts':[[2020,3,2]]},abstract:'<jats:p>Publisher abstract.</jats:p>'}});
  const r=await lookupSource('https://doi.org/10.1234/example',mockOptions(body,'application/json'));
  assert.equal(r.type,'article');assert.equal(r.title,'A real title');assert.deepEqual(r.authors,[author('Smith','Jamie')]);assert.equal(r.year,'2020');assert.equal(r.date,'2020-03-02');assert.equal(r.abstract,'Publisher abstract.');assert.equal(r.summary,'');assert.equal(r.content,'Publisher abstract.');assert.equal(r.contentBasis,'Publisher-supplied abstract');assert.equal(r.importStatus,'metadata-found');
  assert.ok(r.evidence.some(e=>e.field==='year'&&e.provider==='Crossref'));assert.deepEqual(r.verification,r.evidence);assert.deepEqual(r.missing,[]);
  assert.ok(r.id);assert.equal(r.include,false);assert.deepEqual(r.overrides,{reference:'',parenthetical:'',narrative:''});assert.deepEqual(r.attachments,[]);
});
test('failed/mismatched DOI import never fabricates bibliographic fields',async()=>{
  const r=await lookupSource('10.1234/example',mockOptions(JSON.stringify({message:{DOI:'10.9999/wrong',title:['Wrong article']}}),'application/json'));
  assert.equal(r.title,'');assert.equal(r.year,'');assert.deepEqual(r.authors,[]);assert.equal(r.doi,'10.1234/example');assert.match(r.warnings.join(' '),/matching DOI/);assert.equal(r.importStatus,'needs-review');
});
test('URL intake reads actual author/date metadata and preserves necessary query/fragments',async()=>{
  const html=`<html><head><title>Fallback</title><meta name="citation_title" content="An actual source"><meta name="citation_author" content="Smith, Jamie"><meta name="citation_publication_date" content="2022-07-10"><meta name="citation_journal_title" content="Real Journal"><meta name="citation_volume" content="12"><meta name="citation_doi" content="10.1234/page"></head><body><nav>Navigation</nav><main><p>Evidence from the actual text.</p><script>alert(1)</script></main><footer>Copyright 2026</footer></body></html>`;
  const r=await lookupSource('https://example.org/paper?id=123&utm_source=email#section2',mockOptions(html));
  assert.equal(r.url,'https://example.org/paper?id=123#section2');assert.equal(r.type,'article');assert.equal(r.title,'An actual source');assert.deepEqual(r.authors,[author('Smith','Jamie')]);assert.equal(r.year,'2022');assert.equal(r.content,'Evidence from the actual text.');assert.equal(r.doi,'10.1234/page');assert.equal(r.evidence.find(e=>e.field==='year').status,'verified');
});
test('copyright year, generic dateModified and HTTP access never become publication year',()=>{
  const r=parseHtml('<html><head><title>Page</title><script type="application/ld+json">{"@type":"WebPage","name":"Page","dateModified":"2026-01-01","copyrightYear":2026}</script></head><body><p>Copyright 2026</p></body></html>','https://example.org/page');
  assert.equal(r.year,'');assert.ok(r.missing.includes('year'));assert.match(r.warnings.join(' '),/copyright/i);
  const clinical=parseHtml('<html><head><script type="application/ld+json">{"@type":"MedicalWebPage","name":"Topic","dateModified":"2025-01-03","author":{"@type":"Person","name":"Jane Doe"}}</script></head></html>','https://www.uptodate.com/contents/topic');
  assert.equal(clinical.type,'uptodate');assert.equal(clinical.year,'2025');assert.deepEqual(clinical.authors,[{literal:'Jane Doe'}]);assert.match(clinical.warnings.join(' '),/family\/given/);
});
test('SSRF protection rejects local URLs, mixed private DNS answers and unsafe redirects',async()=>{
  await assert.rejects(lookupSource('http://127.0.0.1/'),/private|unsupported/);await assert.rejects(lookupSource('https://localhost/'),/Private|local/);
  await assert.rejects(lookupSource('https://example.org/',{resolve:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),/private/);
  const options={resolve:async()=>[{address:'8.8.8.8',family:4}],fetch:async()=>({status:302,headers:{get:name=>name==='location'?'http://127.0.0.1/private':''},text:async()=>''})};
  const result=await lookupSource('https://example.org/',options);assert.equal(result.title,'');assert.match(result.warnings.join(' '),/private/);
  for(const ip of ['10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','::ffff:7f00:1'])assert.equal(publicIp(ip),false,ip);
  assert.equal(publicIp('8.8.8.8'),true);assert.equal(publicIp('2606:4700:4700::1111'),true);
});
test('plain citation text and PDF URL produce explicitly incomplete editable source records',async()=>{
  const plain=await lookupSource('Smith (2020). A source.');assert.equal(plain.content,'Smith (2020). A source.');assert.equal(plain.title,'');assert.equal(plain.importStatus,'needs-review');assert.deepEqual(plain.missing,['title','authors','year']);
  const pdf=await lookupSource('https://example.org/source.pdf',mockOptions('%PDF-1.7','application/pdf'));assert.equal(pdf.title,'');assert.match(pdf.warnings.join(' '),/returned a PDF/);
});
test('normalization preserves identifiers and legal fragments; rejects credentials/active protocols',()=>{
  assert.equal(normalizeUrl('https://example.org/drug?id=123&type=abbpi&utm_source=x#s2'),'https://example.org/drug?id=123&type=abbpi#s2');
  assert.equal(normalizeDoi('doi:10.1234/test'),'10.1234/test');assert.equal(normalizeDoi('10.notadoi/test'),'');
  assert.throws(()=>normalizeUrl('javascript:alert(1)'),/HTTP/);assert.throws(()=>normalizeUrl('https://user:password@example.org'),/credentials/);
});
test('renderer journal/mims aliases use the actual journal/clinical formats',()=>{
  const journal=formatSource({type:'journal',title:'Journal article',authors:[author('Jones')],year:'2020',container:'Journal with Original CASE',volume:'1'});
  assert.match(journal.referenceHtml,/<i>Journal with Original CASE<\/i>, <i>1<\/i>/);assert.doesNotMatch(journal.warnings.join(' '),/Source type/);
  const mims=formatSource({type:'emims',title:'Lipitor',year:'2025',retrieved:'2025-04-29',url:'https://app.emimselite.com/medicineview?id=123&type=abbpi'});
  assert.match(mims.reference,/eMIMSelite\. Retrieved April 29, 2025/);assert.doesNotMatch(mims.warnings.join(' '),/Source type/);
});
test('no-author bibliography sorts on actual title and question marks avoid an extra full stop',()=>{
  const noAuthor=book('n','An Apple?', '2020',[]),named=book('b','Named book','2020',[author('Brown')]);
  const result=bibliography({sources:[named,noAuthor]});assert.deepEqual(result.entries.map(e=>e.id),['n','b']);assert.match(result.entries[0].reference,/An Apple\? \(2020\)/);assert.doesNotMatch(result.entries[0].reference,/\?\./);
});

// Primary examples reviewed 2026-10-05: Griffith APA7, no-author and clinical/legal sections.
// https://www.griffith.edu.au/library/study/referencing/apa-7
test('Griffith distinguishes legacy MIMS Online from current eMIMSelite and keeps explicit database names',()=>{
  const legacy=formatSource({type:'mims',title:'Lipitor',year:'2020',retrieved:'2021-10-26',url:'https://www.mimsonline.com.au/Search/AbbrPI.aspx?ID=37190001_2'});
  assert.match(legacy.reference,/\(2020\)\. MIMS Online\. Retrieved October 26, 2021, from/);assert.equal(legacy.parenthetical,'(“Lipitor”, 2020)');assert.match(legacy.referenceHtml,/<i>MIMS Online<\/i>/);assert.doesNotMatch(legacy.referenceHtml,/<i>Lipitor/);
  for(const type of ['emims','emimselite']) {const current=formatSource({type,title:'Lipitor',year:'2025',retrieved:'2025-04-29',url:'https://app.emimselite.com/medicineview?id=123&type=abbpi'});assert.match(current.reference,/eMIMSelite\. Retrieved April 29, 2025/);assert.equal(current.parenthetical,'(“Lipitor”, 2025)');}
  const explicit=formatSource({type:'mims',title:'Drug entry',container:'Database edition explicitly supplied',year:'2024',retrieved:'2025-01-01',url:'https://example.org/drug?id=12'});assert.match(explicit.reference,/Database edition explicitly supplied/);assert.doesNotMatch(explicit.reference,/MIMS Online|eMIMSelite/);
});
test('Griffith changing clinical entries retain last-update year distinct from retrieval year',()=>{
  const entry=formatSource({type:'uptodate',title:'A clinical entry',authors:[author('Clinician','Morgan C.')],year:'2019',retrieved:'2026-10-05',url:'https://www.uptodate.com/contents/a-clinical-entry'});assert.match(entry.reference,/Clinician, M. C. \(2019\)\. A clinical entry\. UpToDate\. Retrieved October 5, 2026, from/);assert.equal(entry.parenthetical,'(Clinician, 2019)');assert.match(entry.referenceHtml,/<i>UpToDate<\/i>/);assert.doesNotMatch(entry.referenceHtml,/<i>A clinical entry/);
  const invalid=formatSource({type:'uptodate',title:'A clinical entry',year:'2019',retrieved:'2025-02-30',url:'https://www.uptodate.com/contents/a-clinical-entry'});assert.match(invalid.warnings.join(' '),/valid retrieval date/);assert.doesNotMatch(invalid.reference,/Retrieved/);
});
test('Griffith complete Australian Act titles and compound subdivisions preserve publication identifiers',()=>{
  const complete=formatSource({type:'legislation',title:'Aboriginal Land Rights Act 1983 No 42 (NSW)',year:'1983',subdivision:'s 36AA',country:'Austl.',url:'https://www.legislation.nsw.gov.au/#/view/act/1983/42/part2/div2/sec36aa'});assert.match(complete.reference,/Aboriginal Land Rights Act 1983 No 42 \(NSW\) s 36AA \(Austl.\)/);assert.equal(complete.parenthetical,'(Aboriginal Land Rights Act 1983 No 42 (NSW), s 36AA)');assert.doesNotMatch(complete.warnings.join(' '),/jurisdiction missing/);assert.ok(complete.reference.endsWith('#/view/act/1983/42/part2/div2/sec36aa'));
  const part=formatSource({type:'legislation',title:'Lands Acquisition Act',year:'1989',jurisdiction:'Cth',subdivision:'pt V div 2',country:'Austl.'});assert.match(part.reference,/Lands Acquisition Act 1989 \(Cth\) pt V div 2 \(Austl.\)/);assert.equal(part.parenthetical,'(Lands Acquisition Act 1989 (Cth), pt V div 2)');
  const whole=formatSource({type:'legislation',title:'Lands Acquisition Act',year:'1989',jurisdiction:'Cth',country:'Austl.'});assert.equal(whole.parenthetical,'(Lands Acquisition Act 1989 (Cth))');assert.doesNotMatch(whole.reference,/pt V|div 2/);
});
