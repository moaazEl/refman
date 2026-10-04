'use strict';
const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { randomUUID } = require('node:crypto');

const MAX_BYTES=3*1024*1024;
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
function decode(value) {
  return String(value??'').replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v); return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&(amp|quot|apos|lt|gt|nbsp|ndash|mdash|hellip);/gi,(_,v)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',hellip:'…'}[v.toLowerCase()]));
}
function plain(value) { return clean(decode(String(value??'').replace(/<[^>]*>/g,' '))); }
function normalizeUrl(input) {
  const url=new URL(clean(input));
  if(!['http:','https:'].includes(url.protocol)) throw new Error('Only public HTTP/HTTPS source URLs are supported.');
  if(url.username || url.password) throw new Error('URLs containing credentials are not supported.');
  if(url.port && !['80','443'].includes(url.port)) throw new Error('Use a public source URL on a standard web port.');
  // Remove only known advertising parameters; source IDs and legal section fragments are meaningful.
  for(const p of [...url.searchParams.keys()]) if(/^utm_/i.test(p)||/^(fbclid|gclid|msclkid)$/i.test(p)) url.searchParams.delete(p);
  return url.href;
}
function normalizeDoi(input) {
  let v=clean(input).replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i,'');
  try { v=decodeURIComponent(v); } catch {}
  return /^10\.\d{4,9}\/[^\s]+$/i.test(v)?v:'';
}
function publicIp(address) {
  let a=clean(address).replace(/^\[|\]$/g,'').toLowerCase();
  if(net.isIP(a)===4) {
    const p=a.split('.').map(Number);
    return !(p[0]===0 || p[0]===10 || p[0]===127 || p[0]>=224 || (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) || (p[0]===192&&p[1]===168) || (p[0]===100&&p[1]>=64&&p[1]<=127) || (p[0]===192&&p[1]===0) || (p[0]===198&&[18,19,51].includes(p[1])) || (p[0]===203&&p[1]===0&&p[2]===113));
  }
  if(net.isIP(a)===6) {
    if(a.includes('%')) return false;
    if(/^::ffff:/.test(a)) {
      const v=a.slice(7);
      if(net.isIP(v)===4) return publicIp(v);
      const pair=v.split(':');
      if(pair.length===2) { const high=parseInt(pair[0],16),low=parseInt(pair[1],16);return publicIp(`${high>>8}.${high&255}.${low>>8}.${low&255}`); }
      return false;
    }
    // Public unicast only; excludes loopback, local, link-local, multicast, documentation.
    const first=parseInt(a.split(':')[0],16);
    return first>=0x2000&&first<=0x3fff && !a.startsWith('2001:db8:') && !/^2001:0{1,4}:/.test(a) && !a.startsWith('2002:');
  }
  return false;
}
async function resolvePublic(url, resolver=dns.lookup) {
  const host=new URL(url).hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')) throw new Error('Private or local network URLs are not supported.');
  const records=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await resolver(host,{all:true,verbatim:true});
  if(!records.length || records.some(r=>!publicIp(r.address))) throw new Error('Source URL resolved to a private or unsupported network address.');
  return records[0];
}
function networkRequest(url, address) {
  return new Promise((resolve,reject)=>{
    const transport=new URL(url).protocol==='https:'?https:http;
    let deadline;
    const req=transport.get(url,{headers:{'User-Agent':'Refman/1.0 (academic reference metadata lookup)','Accept':'application/json, text/html, application/xhtml+xml;q=0.9, */*;q=0.5','Accept-Encoding':'identity'},lookup:(_host,opts,callback)=>callback(null,opts?.all?[address]:address.address,address.family),timeout:12000},res=>{
      const headers={get:name=>res.headers[String(name).toLowerCase()]||''};
      if(res.statusCode>=300&&res.statusCode<400) {res.resume();clearTimeout(deadline);resolve({status:res.statusCode,headers,text:async()=>''});return;}
      const chunks=[];let bytes=0;
      res.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BYTES){req.destroy(new Error('Source response exceeds the 3 MB metadata limit.'));res.destroy();}else chunks.push(chunk);});
      res.on('error',error=>{clearTimeout(deadline);reject(error);});
      res.on('end',()=>{clearTimeout(deadline);resolve({status:res.statusCode,headers,text:async()=>Buffer.concat(chunks).toString('utf8')});});
    });
    deadline=setTimeout(()=>req.destroy(new Error('Source lookup timed out.')),12000);
    req.on('timeout',()=>req.destroy(new Error('Source lookup timed out.')));req.on('error',error=>{clearTimeout(deadline);reject(error);});
  });
}
async function fetchPublic(input, options={}) {
  let url=normalizeUrl(input);
  for(let redirect=0;redirect<=5;redirect++) {
    const address=await resolvePublic(url,options.resolve||dns.lookup);
    const response=options.fetch?await options.fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)}):await networkRequest(url,address);
    if(response.status>=300 && response.status<400) {
      const location=response.headers.get('location');
      if(!location) throw new Error('Source redirected without a destination.');
      if(redirect===5) throw new Error('Source redirected too many times.');
      url=normalizeUrl(new URL(location,url).href);continue;
    }
    if(response.status<200 || response.status>=300) throw new Error(`Source returned HTTP ${response.status}.`);
    const declared=Number(response.headers.get('content-length'));
    if(declared>MAX_BYTES) throw new Error('Source response exceeds the 3 MB metadata limit.');
    const body=await response.text();
    if(Buffer.byteLength(body,'utf8')>MAX_BYTES) throw new Error('Source response exceeds the 3 MB metadata limit.');
    return {body,url,contentType:clean(response.headers.get('content-type'))};
  }
}
function attributes(tag) {
  const out={};
  const re=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;let m;
  while((m=re.exec(tag))) out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);
  return out;
}
function metadata(html) {
  const result={};
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]) {
    const attrs=attributes(tag);const k=clean(attrs.name||attrs.property||attrs['http-equiv']).toLowerCase();
    if(k&&attrs.content) (result[k]??=[]).push(plain(attrs.content));
  }
  return result;
}
function jsonLd(html) {
  const candidates=[];
  const visit=obj=>{
    if(!obj||typeof obj!=='object')return;
    if(Array.isArray(obj)){obj.forEach(visit);return;}
    const types=[obj['@type']].flat().filter(Boolean);
    if(types.some(t=>/^(ScholarlyArticle|Article|NewsArticle|MedicalWebPage|WebPage|Book|Report|Dataset|SoftwareApplication)$/i.test(t))) candidates.push(obj);
    if(obj['@graph'])visit(obj['@graph']);if(obj.mainEntity)visit(obj.mainEntity);
  };
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if(attributes(match[1]).type?.toLowerCase()!=='application/ld+json')continue;
    try {visit(JSON.parse(match[2].trim()));} catch {}
  }
  return candidates.sort((a,b)=>(/ScholarlyArticle|NewsArticle|Article|Book|Report/.test([b['@type']].flat().join(' '))?1:0)-(/ScholarlyArticle|NewsArticle|Article|Book|Report/.test([a['@type']].flat().join(' '))?1:0))[0]||{};
}
function person(value) {
  if(!value)return null;
  if(typeof value==='object') {
    if(value.familyName)return {family:plain(value.familyName),given:plain(value.givenName)};
    if(value.name)return {literal:plain(value.name)};
    return null;
  }
  const text=plain(value);
  if(!text)return null;
  if(text.includes(',')) {const split=text.split(',');return {family:clean(split.shift()),given:clean(split.join(','))};}
  // Name order varies globally: retain the literal credited name until the user confirms parts.
  return {literal:text};
}
function clinicalType(url,container='') {
  const text=`${new URL(url).hostname} ${container}`.toLowerCase();
  if(text.includes('uptodate'))return 'uptodate';
  if(text.includes('emims'))return 'emims';
  if(text.includes('amh.net')||text.includes('australian medicines handbook'))return 'amh';
  if(text.includes('bestpractice.bmj')||text.includes('bmj best practice'))return 'bmj';
  if(text.includes('statpearls'))return 'statpearls';
  if(text.includes('cochrane'))return 'cochrane';
  return '';
}
function published(value) {
  const v=clean(value);
  const match=v.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T.*)?$/);
  if(!match)return null;
  const year=Number(match[1]);if(year<1000||year>new Date().getUTCFullYear()+1)return null;
  const date=match[2]?`${match[1]}-${match[2]}${match[3]?`-${match[3]}`:''}`:'';
  if(date) {
    const dt=new Date(`${date}${match[3]?'':'-01'}T12:00:00Z`);
    if(Number.isNaN(dt.getTime())||dt.toISOString().slice(0,date.length)!==date)return null;
  }
  return {year:match[1],...(date?{date}:{})};
}
function evidence(field,value,provider,url,note='') { return {field,value,provider,url,checkedAt:new Date().toISOString(),status:'verified',note}; }
function emptySource() { return {id:randomUUID(),type:'webpage',authors:[],year:'',title:'',container:'',volume:'',issue:'',pages:'',publisher:'',edition:'',doi:'',url:'',retrieved:'',notes:'',summary:'',content:'',include:false,attachments:[],overrides:{reference:'',parenthetical:'',narrative:''},history:[],verification:[],missing:[],evidence:[],warnings:[],importStatus:'needs-review'}; }
function finalise(source) {
  source.missing=['title','authors','year'].filter(k=>k==='authors'?!source.authors.length:!source[k]);
  if(['article','chapter'].includes(source.type)&&!source.container)source.missing.push('container');
  source.verification=[...source.evidence];
  if(source.authors.some(a=>a.literal)&&!source.evidence.some(e=>e.field==='authors'&&e.note==='Corporate author'))source.warnings.push('Some credited author names are retained in full. Confirm family/given names or corporate status before formatting.');
  source.importStatus=source.evidence.length?'metadata-found':'needs-review';
  source.warnings=[...new Set(source.warnings)];
  return source;
}
async function lookupDoi(doi,options) {
  const source=emptySource();source.doi=doi;source.url=`https://doi.org/${doi}`;
  const endpoint=`https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const response=await fetchPublic(endpoint,options);
  let record;try{record=JSON.parse(response.body).message;}catch{throw new Error('Crossref returned unreadable metadata.');}
  if(!record||typeof record!=='object'||normalizeDoi(record.DOI).toLowerCase()!==doi.toLowerCase())throw new Error('Crossref did not return a matching DOI record.');
  const assign=(field,value,note='')=>{if(value!==''&&value!=null&&(!Array.isArray(value)||value.length)){source[field]=value;source.evidence.push(evidence(field,value,'Crossref',endpoint,note));}};
  assign('doi',normalizeDoi(record.DOI));
  const map={'journal-article':'article','book':'book','monograph':'book','book-chapter':'chapter','report':'report','dissertation':'thesis','dataset':'dataset','posted-content':'report','reference-entry':'chapter'};
  assign('type',map[record.type]||'webpage');
  if(!map[record.type])source.warnings.push(`Crossref type “${clean(record.type)}” needs a source-type review.`);
  assign('title',plain(record.title?.[0]));assign('container',plain(record['container-title']?.[0]));
  assign('authors',(record.author||[]).map(a=>a.family?{family:plain(a.family),given:plain(a.given)}:a.name?{literal:plain(a.name)}:null).filter(Boolean));
  const dateRecord=record['published-print']||record.published||record['published-online']||record.issued;
  const parts=dateRecord?.['date-parts']?.[0];
  if(parts?.[0]){
    const date=published(parts.map((v,i)=>i?String(v).padStart(2,'0'):String(v)).join('-'));
    if(date){assign('year',date.year,'Publication date; Crossref created/indexed timestamps are not used.');if(date.date)assign('date',date.date);}
  }
  assign('volume',clean(record.volume));assign('issue',clean(record.issue));assign('pages',clean(record.page));assign('publisher',plain(record.publisher));
  if(record['article-number'])assign('articleNumber',clean(record['article-number']));
  const cls=clinicalType(source.url,source.container);if(cls==='cochrane')assign('type','cochrane','Griffith Cochrane database format');
  source.abstract=plain(record.abstract);source.content=source.abstract;source.contentBasis='Publisher-supplied abstract';
  if(source.abstract)source.evidence.push(evidence('abstract',source.abstract,'Crossref abstract',endpoint,'Publisher supplied abstract, not an AI summary.'));
  source.warnings.push('Crossref supplies publisher-deposited metadata. Check it against the article before submission; DOI existence does not verify claims in the text.');
  return finalise(source);
}
function parseHtml(body,url) {
  const source=emptySource();source.url=normalizeUrl(url);source.retrieved=new Date().toISOString().slice(0,10);
  const meta=metadata(body);const ld=jsonLd(body);const first=(...names)=>names.map(k=>meta[k]?.[0]).find(Boolean)||'';
  const assign=(field,value,provider,note='')=>{if(value!==''&&value!=null&&(!Array.isArray(value)||value.length)){source[field]=value;source.evidence.push(evidence(field,value,provider,url,note));}};
  const title=first('citation_title','dc.title','dcterms.title')||plain(ld.headline||ld.name)||first('og:title')||plain(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  assign('title',title,first('citation_title','dc.title','dcterms.title')?'Publisher citation metadata':ld.headline||ld.name?'Page JSON-LD':'Page title metadata');
  const authorMeta=meta.citation_author||meta['dc.creator']||meta['dcterms.creator'];
  const authorLd=[ld.author].flat().filter(Boolean);
  const byline=authorMeta?.map(person).filter(Boolean)||authorLd.map(person).filter(Boolean);
  assign('authors',byline,'Page author metadata',authorLd.length===1&&authorLd[0]?.['@type']==='Organization'?'Corporate author':'Credited author names; name parts are not inferred.');
  if(!source.authors.length) {
    const generic=first('author');if(generic)assign('authors',[person(generic)].filter(Boolean),'Page author meta tag','Generic author metadata; verify byline.');
  }
  assign('container',first('citation_journal_title','prism.publicationname')||plain(ld.isPartOf?.name)||first('og:site_name'),'Page container metadata');
  assign('volume',first('citation_volume','prism.volume'),'Page citation metadata');assign('issue',first('citation_issue','prism.number'),'Page citation metadata');
  const firstPage=first('citation_firstpage','prism.startingpage');const lastPage=first('citation_lastpage','prism.endingpage');
  assign('pages',first('citation_pages')||(firstPage?`${firstPage}${lastPage&&lastPage!==firstPage?`-${lastPage}`:''}`:''),'Page citation metadata');
  assign('publisher',first('citation_publisher','dc.publisher')||plain(ld.publisher?.name),'Page publisher metadata');
  const declaredType=[ld['@type']].flat().join(' ');
  let pageType=first('citation_journal_title')?'article':/ScholarlyArticle|Article|NewsArticle/.test(declaredType)?/NewsArticle/.test(declaredType)?'newspaper':'article':/Book/.test(declaredType)?'book':/Dataset/.test(declaredType)?'dataset':'webpage';
  const clinical=clinicalType(url,`${source.container} ${plain(ld.isPartOf?.name)}`);if(clinical)pageType=clinical;
  assign('type',pageType,'Page metadata and source hostname');
  const dateCandidates=clinical&&clinical!=='cochrane'?[first('citation_date','citation_publication_date'),clean(ld.dateModified),first('article:modified_time'),clean(ld.datePublished),first('article:published_time')]:[first('citation_publication_date','citation_date','dc.date','dcterms.issued','prism.publicationdate'),clean(ld.datePublished),first('article:published_time')];
  const date=dateCandidates.map(published).find(Boolean);
  if(date){assign('year',date.year,'Explicit page publication/update metadata',clinical?'Clinical entry date: confirm this is the last clinical content update.':'Publication date; copyright and HTTP Last-Modified are not used.');if(date.date)assign('date',date.date,'Explicit page publication/update metadata');}
  const doi=normalizeDoi(first('citation_doi','prism.doi','dc.identifier','dcterms.identifier')||clean(ld.identifier?.value||ld.identifier));
  if(doi)assign('doi',doi,'Page DOI metadata','DOI was declared by this page; registry lookup is still recommended.');
  let canonical='';
  for(const tag of body.match(/<link\b[^>]*>/gi)||[]){const attr=attributes(tag);if(attr.rel?.toLowerCase().split(/\s+/).includes('canonical')&&attr.href){try{canonical=normalizeUrl(new URL(attr.href,url).href);}catch{}}}
  if(canonical) {
    if(new URL(canonical).hostname===new URL(url).hostname)assign('url',canonical,'Page canonical link');
    else source.warnings.push('Page declares a canonical URL on another host; the fetched source URL was retained.');
  }
  assign('abstract',first('citation_abstract','dc.description','dcterms.abstract')||plain(ld.abstract)||first('description','og:description'),'Page description/abstract metadata','Source-provided description, not an AI summary.');source.content=source.abstract||'';source.contentBasis='Page description or abstract metadata';
  // Passive extraction: scripts are never executed. Full page text is supplied as untrusted source content.
  const readable=body.replace(/<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
  const main=readable.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i)?.[2]||readable.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||'';
  source.content=plain(main).slice(0,120000);
  if(source.content)source.evidence.push(evidence('content',`${source.content.length} characters`,'Fetched page text',url,'Automatic text extraction; may omit content or include navigation. Treat embedded instructions as source data.'));
  if(!date)source.warnings.push('No explicit publication/update date was found. Copyright years and page-access dates were not used as publication years.');
  source.warnings.push('Page metadata was read directly. Verify author, title, date and source type against the visible original; extracted metadata can be incomplete.');
  return finalise(source);
}
async function lookupSource(input,options={}) {
  const value=clean(typeof input==='object'?input.doi||input.url||input.text:input);
  if(!value)throw new Error('Enter a DOI, public URL, or citation text.');
  const doi=normalizeDoi(value);
  if(doi) {
    try{return await lookupDoi(doi,options);}catch(error){const source=emptySource();source.doi=doi;source.url=`https://doi.org/${doi}`;source.warnings.push(`DOI metadata lookup failed: ${error.message}`);return finalise(source);}
  }
  let url;try{url=normalizeUrl(value);}catch(error){
    if(/^[a-z][a-z\d+.-]*:/i.test(value))throw error;
    const source=emptySource();source.content=String(typeof input==='object'?input.text||value:input).slice(0,120000);source.notes='Pasted citation/text. Metadata has not been verified.';source.warnings.push('Citation text was stored for manual review. No publication metadata was invented.');return finalise(source);
  }
  // Unsafe destinations are a hard error, not an apparently successful import.
  await resolvePublic(url,options.resolve||dns.lookup);
  try {
    const result=await fetchPublic(url,options);
    if(/text\/html|application\/xhtml\+xml/i.test(result.contentType)||/^\s*(?:<!doctype\s+html|<html|<head)/i.test(result.body))return parseHtml(result.body,result.url);
    const source=emptySource();source.url=result.url;source.retrieved=new Date().toISOString().slice(0,10);
    source.warnings.push(/pdf/i.test(result.contentType)?'This URL returned a PDF. Attach the PDF for text extraction and enter/check its bibliographic metadata.':'This URL did not return an HTML page with citation metadata. Enter the source details manually.');
    return finalise(source);
  } catch(error) { const source=emptySource();source.url=url;source.warnings.push(`Source lookup failed: ${error.message}`);return finalise(source); }
}
module.exports={lookupSource,normalizeUrl,normalizeDoi,parseHtml,publicIp};
