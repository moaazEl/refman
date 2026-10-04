'use strict';

// Griffith APA 7 examples: https://www.griffith.edu.au/library/study/referencing/apa-7
// This intentionally covers declared record types rather than claiming universal APA support.
const GUIDE = 'https://www.griffith.edu.au/library/study/referencing/apa-7';
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = value => clean(value).normalize('NFKD').toLocaleLowerCase('en').replace(/^[\W_]*(a|an|the)\s+/i, '');
const compare = (a,b) => a.localeCompare(b, 'en', {sensitivity:'base', numeric:true});
const italic = value => `<i>${escapeHtml(value)}</i>`;
const end = value => /[.!?](?:<\/[^>]+>)*$/.test(value) ? value : `${value}.`;
const textFromHtml = value => value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
function authors(source) { return (Array.isArray(source.authors) ? source.authors : []).filter(a => clean(a?.family || a?.literal)); }
function initials(given) {
  return clean(given).split(/\s+/).filter(Boolean).map(part => part.split('-').filter(Boolean).map(p => (p.match(/\p{L}/u)?.[0] || '').toUpperCase()+'.').join('-')).join(' ');
}
function name(a, reverse = false) { return clean(a.literal) || (reverse ? `${initials(a.given)} ${clean(a.family)}`.trim() : [clean(a.family),initials(a.given)].filter(Boolean).join(', ')); }
function refAuthors(source) {
  const names = authors(source).map(a => name(a));
  if (names.length > 20) return `${names.slice(0,19).join(', ')}, . . . ${names.at(-1)}`;
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length > 2) return `${names.slice(0,-1).join(', ')}, & ${names.at(-1)}`;
  return names[0] || '';
}
function identity(source) { return authors(source).map(a => clean(a.literal) || `${clean(a.family)}|${clean(a.given)}`).join('||') || `title:${key(source.title)}`; }
function year(source) { const v = clean(source.year); return /^\d{4}$/.test(v) ? v : 'n.d.'; }
function type(source) {
  const t = clean(source.type).toLowerCase().replace(/[_ ]/g,'-');
  const aliases = {'journal':'article','journal-article':'article','article-journal':'article','web':'webpage','website':'webpage','book-chapter':'chapter','drug':'clinical','clinical-database':'clinical','systematic-review':'cochrane','statute':'legislation','legal-case':'case','government':'report','government-report':'report','newspaper-article':'newspaper'};
  return aliases[t] || t || 'webpage';
}
const clinicalTypes = new Set(['clinical','uptodate','mims','emims','emimselite','amh','bmj','bmj-best-practice','statpearls']);
const standAlone = new Set(['book','webpage','report','thesis','dataset','software','standard']);
function sameSource(a,b) { return a === b || (a.id != null && b.id != null && a.id === b.id); }
function contextSources(source,project) { const entries=(project?.sources || []).filter(s => s.include === true); if (!entries.some(s=>sameSource(s,source))) entries.push(source); return entries; }
function suffix(source,project) {
  const peers=contextSources(source,project).filter(s=>identity(s)===identity(source) && year(s)===year(source)).sort((a,b)=>compare(key(a.title),key(b.title)) || compare(clean(a.id),clean(b.id)));
  if(peers.length<2) return '';
  let index=peers.findIndex(s=>sameSource(s,source)); if(index<0) index=0;
  // Spreadsheet-style alphabetic sequence remains deterministic beyond 26 records.
  let result=''; for(let n=index+1;n>0;n=Math.floor((n-1)/26)) result=String.fromCharCode(97+(n-1)%26)+result;
  return year(source)==='n.d.' ? `-${result}` : result;
}
function yearLabel(source,project) { return year(source)+suffix(source,project); }
function citationTitle(source) {
  const value=clean(source.shortTitle || source.title) || '[Title missing]';
  const title=value.replace(/\b\p{L}/gu,c=>c.toUpperCase());
  return standAlone.has(type(source)) ? title : `“${title}”`;
}
function authorLabels(source,project) {
  const list=authors(source);
  if(!list.length) return {parent: citationTitle(source), narrative:citationTitle(source)};
  const peers=contextSources(source,project);
  const surname = (a) => {
    if(a.literal) return clean(a.literal);
    const ambiguous=peers.some(s=>authors(s).some(b=>!b.literal && clean(b.family)===clean(a.family) && clean(b.given) && clean(a.given) && clean(b.given)!==clean(a.given)));
    return ambiguous && clean(a.given) ? `${initials(a.given)} ${clean(a.family)}` : clean(a.family);
  };
  const labels=list.map(surname);
  if(list.length===1) return {parent:labels[0], narrative:labels[0]};
  if(list.length===2) return {parent:labels.join(' & '), narrative:labels.join(' and ')};
  let count=1;
  // Different author groups that collapse to the same et-al label need more names.
  const collision=peers.filter(s=>!sameSource(s,source) && year(s)===year(source) && authors(s).length>=3 && identity(s)!==identity(source) && surname(authors(s)[0])===labels[0]);
  while(count<list.length && collision.some(s=>authors(s).slice(0,count).map(surname).join('|')===labels.slice(0,count).join('|'))) count++;
  if(count>=list.length || count===list.length-1) return {parent:`${labels.slice(0,-1).join(', ')}, & ${labels.at(-1)}`, narrative:`${labels.slice(0,-1).join(', ')}, and ${labels.at(-1)}`};
  const label=`${labels.slice(0,count).join(', ')}${count===1?' ':', '}et al.`;
  return {parent:label,narrative:label};
}
function doiLink(value) { return clean(value).replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,''); }
function safeLink(value) { try { const url=new URL(clean(value)); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function ordinal(value) { const n=Number(value); if(!Number.isInteger(n)) return clean(value); return `${n}${n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th')}`; }
function edition(value) { const v=clean(value); return v ? /ed\.?$/i.test(v) ? v : `${ordinal(v)} ed.` : ''; }
function retrievalDate(value) {
  const match=clean(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if(!match) return '';
  const dt=new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  if(Number.isNaN(dt.getTime()) || dt.toISOString().slice(0,10)!==match[0].slice(0,10)) return '';
  return dt.toLocaleDateString('en-US',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric'});
}
function referenceDate(source,project,warnings) {
  const y=yearLabel(source,project);
  if(clean(source.year) && !/^\d{4}$/.test(clean(source.year))) warnings.push('Year must be a four-digit publication/update year; n.d. used pending review.');
  const t=type(source);
  if(['webpage','newspaper','report'].includes(t) && source.date) {
    const d=clean(source.date).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if(d && d[1]===year(source)) {
      const dt=new Date(`${d[1]}-${d[2]}-${d[3]||'01'}T12:00:00Z`);
      if(!Number.isNaN(dt.getTime()) && dt.toISOString().slice(0,7)===`${d[1]}-${d[2]}` && (!d[3] || dt.toISOString().slice(0,10)===source.date)) return `${y}, ${dt.toLocaleDateString('en-US',{timeZone:'UTC',month:'long'})}${d[3]?` ${Number(d[3])}`:''}`;
    }
    warnings.push('Publication date could not be formatted; year only used.');
  }
  return y;
}
function formatSource(source={},project={}) {
  const warnings=[]; const t=type(source); const title=clean(source.title)||'[Title missing]';
  const as=authors(source); const author=refAuthors(source); const y=referenceDate(source,project,warnings);
  if(!source.title) warnings.push('Title missing: complete it before submitting.');
  if(!as.length && !['legislation','bill','case'].includes(t)) warnings.push('No author recorded: title moved to author position. Confirm that the work has no credited author.');
  if(year(source)==='n.d.') warnings.push('No verified publication/update year: n.d. used. Do not substitute the website copyright year.');
  const supported=new Set(['article','book','chapter','webpage','report','thesis','cochrane','legislation','bill','case','newspaper','dataset','software','standard',...clinicalTypes]);
  if(!supported.has(t)) warnings.push(`Source type “${t}” needs manual APA review; a webpage-style fallback is shown.`);
  let tail=''; let titleHtml=escapeHtml(title); const container=clean(source.container); const publisher=clean(source.publisher);
  const doi=doiLink(source.doi); let link=doi ? safeLink(`https://doi.org/${doi}`) : safeLink(source.url);
  if(source.url && !safeLink(source.url) && !doi) warnings.push('URL is invalid or unsupported; it was omitted.');
  if(doi && !/^10\.\d{4,9}\/\S+$/i.test(doi)) { warnings.push('DOI format is invalid; DOI omitted pending review.'); link=safeLink(source.url); }
  const urlHtml=link?`<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`:'';
  if(t==='article' || t==='newspaper') {
    if(!container) warnings.push('Journal/newspaper title missing.');
    const volume=clean(source.volume); const issue=clean(source.issue); const pages=clean(source.pages).replace(/\s*[-–]\s*/g,'–');
    tail=container ? italic(container) : '[Container missing]';
    if(volume) tail+=`, ${italic(volume)}${issue?`(${escapeHtml(issue)})`:''}`;
    else if(issue) { tail+=` (${escapeHtml(issue)})`; warnings.push('Issue recorded without volume; confirm the publication format.'); }
    if(pages) tail+=`, ${escapeHtml(pages)}`;
    if(t==='article' && !volume) warnings.push('Volume not recorded; check whether this is an advance online article.');
    if(source.articleNumber) tail+=`, Article ${escapeHtml(source.articleNumber)}`;
    tail=end(tail);
  } else if(t==='cochrane' || clinicalTypes.has(t)) {
    const defaults={uptodate:'UpToDate',mims:'MIMS Online',emims:'eMIMSelite',emimselite:'eMIMSelite',amh:'Australian Medicines Handbook',bmj:'BMJ Best Practice','bmj-best-practice':'BMJ Best Practice',statpearls:'StatPearls',cochrane:'Cochrane Database of Systematic Reviews'};
    const db=container||defaults[t];
    if(!db) warnings.push('Clinical database title missing.');
    tail=end(italic(db||'[Database missing]'));
    if(clinicalTypes.has(t)) {
      const rd=retrievalDate(source.retrieved);
      if(!rd) warnings.push('This changing clinical database entry needs a valid retrieval date (YYYY-MM-DD).');
      if(rd && urlHtml) tail+=` Retrieved ${escapeHtml(rd)}, from ${urlHtml}`;
      else if(urlHtml) tail+=` ${urlHtml}`;
      if(!source.url && !source.doi) warnings.push('Clinical entry URL missing.');
      link='';
    }
  } else if(t==='chapter') {
    if(!container) warnings.push('Book title missing for chapter.');
    const editors=Array.isArray(source.editors)?source.editors.filter(a=>a.family||a.literal):[];
    const en=editors.map(a=>name(a,true));
    let es=en.length>1?`${en.slice(0,-1).join(', ')} & ${en.at(-1)} (Eds.), `:en.length?`${en[0]} (Ed.), `:'';
    if(!en.length) warnings.push('Chapter editors missing; complete them or confirm this book has no editor.');
    const extras=[edition(source.edition),source.pages?`pp. ${clean(source.pages).replace(/\s*[-–]\s*/g,'–')}`:''].filter(Boolean);
    tail=`In ${escapeHtml(es)}${italic(container||'[Book title missing]')}${extras.length?` (${escapeHtml(extras.join(', '))})`:''}.`;
    if(publisher) tail+=` ${escapeHtml(end(publisher))}`; else warnings.push('Chapter publisher missing.');
  } else {
    titleHtml=italic(title);
    const extras=[];
    if(source.edition && clean(source.edition)!=='1') extras.push(edition(source.edition));
    if(source.reportNumber) extras.push(clean(source.reportNumber));
    if(extras.length) titleHtml+=` (${escapeHtml(extras.join(', '))})`;
    if(t==='thesis') titleHtml+=` [${escapeHtml(clean(source.description)||'Thesis')}]`;
    if(t==='dataset') titleHtml+=' [Data set]';
    if(t==='software') titleHtml+=' [Computer software]';
    const origin=['webpage'].includes(t)?container:publisher;
    const sameOrg=as.length===1 && as[0].literal && key(as[0].literal)===key(origin);
    if(origin && !sameOrg) tail=escapeHtml(end(origin));
    if(['book','report','standard'].includes(t) && !publisher) warnings.push('Publisher missing; confirm whether the author is also the publisher.');
    if(source.retrieved && urlHtml) {
      const rd=retrievalDate(source.retrieved);
      if(rd && source.dynamic) { tail+=`${tail?' ':''}Retrieved ${escapeHtml(rd)}, from ${urlHtml}`; link=''; }
      else if(!rd) warnings.push('Retrieval date is invalid.');
    }
  }
  let referenceHtml=author?`${escapeHtml(end(author))} (${escapeHtml(y)}). ${end(titleHtml)}${tail?` ${tail}`:''}`:`${end(titleHtml)} (${escapeHtml(y)}).${tail?` ${tail}`:''}`;
  if(link) referenceHtml+=` ${urlHtml}`;
  const labels=authorLabels(source,project); const cy=yearLabel(source,project);
  let parenthetical=`(${labels.parent}, ${cy})`; let narrative=`${labels.narrative} (${cy})`;
  let firstParenthetical=parenthetical; let firstNarrative=narrative;
  const abbreviation=clean(source.abbreviation||as[0]?.abbreviation);
  if(as.length===1 && as[0].literal && abbreviation) {
    parenthetical=`(${abbreviation}, ${cy})`; narrative=`${abbreviation} (${cy})`;
    firstParenthetical=`(${labels.parent} [${abbreviation}], ${cy})`; firstNarrative=`${labels.narrative} (${abbreviation}, ${cy})`;
  }
  if(['legislation','bill','case'].includes(t)) {
    const jurisdiction=clean(source.jurisdiction); const subdivision=clean(source.subdivision||source.section); const country=clean(source.country);
    if(t==='case') {
      const reporter=[clean(source.volume),container,clean(source.pages)].filter(Boolean).join(' ');
      if(!source.volume || !container || !source.pages) warnings.push('Case reporter volume, abbreviation and first page are required. Use a checked override for neutral citations.');
      referenceHtml=`${italic(title)} (${escapeHtml(cy)})${reporter?` ${escapeHtml(reporter)}`:''}${country?` (${escapeHtml(country)})`:''}.`;
      parenthetical=`(${title}, ${cy}${subdivision?`, ${subdivision}`:''})`; narrative=`${title} (${cy}${subdivision?`, ${subdivision}`:''})`;
    } else {
      // Permit a complete Act title/year/jurisdiction supplied in title, without guessing details.
      const includesYear=new RegExp(`\\b${year(source)}\\b`).test(title);
      const legalName=`${title}${includesYear?'':` ${cy}`}${jurisdiction?` (${jurisdiction})`:''}`;
      if(!jurisdiction && !/\((?:Cth|Qld|NSW|Vic|SA|WA|Tas|NT|ACT)\)/.test(title)) warnings.push('Legal jurisdiction missing. Record it or supply a checked reference override.');
      referenceHtml=`${t==='bill'?escapeHtml(legalName):italic(legalName)}${subdivision?` ${escapeHtml(subdivision)}`:''}${country?` (${escapeHtml(country)})`:''}.`;
      parenthetical=`(${legalName}${subdivision?`, ${subdivision}`:''})`; narrative=subdivision?`${subdivision} of the ${legalName}`:legalName;
    }
    if(urlHtml) referenceHtml+=` ${urlHtml}`;
    firstParenthetical=parenthetical; firstNarrative=narrative;
    warnings.push('Legal record: confirm jurisdiction, subdivisions, parties and reporter details against the Griffith guide.');
  }
  if(as.some(a=>!a.literal && clean(a.given) && contextSources(source,project).some(s=>authors(s).some(b=>!b.literal && clean(b.family)===clean(a.family) && clean(b.given)!==clean(a.given) && initials(b.given)===initials(a.given))))) warnings.push('Different authors share a surname and initials; manually check citation ambiguity against APA guidance.');
  if(as.some(a=>!a.literal && !a.given)) warnings.push('An individual author has no given name/initials; verify the author details.');
  if(project.minYear && /^\d{4}$/.test(clean(source.year)) && Number(source.year)<Number(project.minYear)) warnings.push(`Publication year is before this project’s ${project.minYear} limit.`);
  if(project.maxYear && /^\d{4}$/.test(clean(source.year)) && Number(source.year)>Number(project.maxYear)) warnings.push(`Publication year is after this project’s ${project.maxYear} limit.`);
  const overrides=source.overrides||{};
  if(clean(overrides.reference)) referenceHtml=escapeHtml(clean(overrides.reference));
  if(clean(overrides.parenthetical)) parenthetical=firstParenthetical=clean(overrides.parenthetical);
  if(clean(overrides.narrative)) narrative=firstNarrative=clean(overrides.narrative);
  if(Object.values(overrides).some(v=>clean(v))) warnings.push('Manual citation override applied; check it independently after changing metadata.');
  return {reference:textFromHtml(referenceHtml),referenceHtml,parenthetical,narrative,firstParenthetical,firstNarrative,warnings:[...new Set(warnings)]};
}
function sortIdentity(source) { return authors(source).length ? identity(source) : key(source.title); }
function sortSources(sources) { return [...sources].sort((a,b)=>compare(sortIdentity(a),sortIdentity(b)) || compare(year(a),year(b)) || compare(key(a.title),key(b.title)) || compare(clean(a.id),clean(b.id))); }
function bibliography(project={}) {
  const sources=sortSources((project.sources||[]).filter(s=>s.include===true));
  const entries=sources.map(s=>({id:s.id,number:s.number,...formatSource(s,project)}));
  return {text:entries.map(e=>e.reference).join('\n\n'),html:`<div class="apa-bibliography">${entries.map(e=>`<p style="margin-left:0.5in;text-indent:-0.5in;line-height:2">${e.referenceHtml}</p>`).join('')}</div>`,entries};
}
function combined(ids,project={}) {
  const wanted=new Set(ids||[]); const sources=sortSources((project.sources||[]).filter(s=>wanted.has(s.id)));
  const groups=[];
  for(const source of sources) {
    const result=formatSource(source,project);
    const plain=result.parenthetical.replace(/^\(/,'').replace(/\)$/,'');
    if(source.overrides?.parenthetical || ['legislation','bill','case'].includes(type(source))) {groups.push({identity:null,text:plain});continue;}
    const label=authorLabels(source,project).parent;
    const group=groups.find(g=>g.identity===identity(source));
    if(group) group.years.push(yearLabel(source,project)); else groups.push({identity:identity(source),label,years:[yearLabel(source,project)]});
  }
  return groups.length?`(${groups.map(g=>g.text || `${g.label}, ${[...new Set(g.years)].join(', ')}`).join('; ')})`:'';
}
module.exports={formatSource,bibliography,combined,escapeHtml,GUIDE};
