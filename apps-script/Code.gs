const APP = {
  name: 'CND Docente',
  logo: 'https://i.ibb.co/s9GYqpPN/Whats-App-Image-2026-09-21-at-13-17-43-1.jpg',
  dbName: 'CND Docente | Base de Dados',
  folderName: 'CND Docente | Documentos'
};

const SHEETS = {
  USERS: ['id','name','nameKey','pinHash','role','status','createdAt'],
  DOCS: ['id','candidateId','fileName','fileId','fileUrl','status','note','reviewedBy','reviewedAt','createdAt'],
  EXAMS: ['id','title','description','status','passingPercent','timeLimitMinutes','maxAttempts','createdAt'],
  QUESTIONS: ['id','examId','statement','imageUrl','points','orderIndex'],
  ALTS: ['id','questionId','text','orderIndex','isCorrect'],
  ATTEMPTS: ['id','examId','candidateId','score','maxScore','passed','startedAt','submittedAt','createdAt'],
  ANSWERS: ['id','attemptId','questionId','alternativeId'],
  CNDS: ['id','candidateId','number','issuedAt','status'],
  LOGS: ['id','actorId','action','targetType','targetId','metadata','createdAt']
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP.name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setup() {
  var p = PropertiesService.getScriptProperties();
  var ssId = p.getProperty('DB_ID');
  var ss;
  if (ssId) {
    try { ss = SpreadsheetApp.openById(ssId); } catch(e) {}
  }
  if (!ss) {
    ss = SpreadsheetApp.create(APP.dbName);
    p.setProperty('DB_ID', ss.getId());
  }
  Object.keys(SHEETS).forEach(function(k) {
    var name = k;
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,SHEETS[k].length).setValues([SHEETS[k]]);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,SHEETS[k].length).setFontWeight('bold');
    }
  });
  var folderId = p.getProperty('DOC_FOLDER_ID');
  if (!folderId) {
    var folder = DriveApp.createFolder(APP.folderName);
    p.setProperty('DOC_FOLDER_ID', folder.getId());
  }
  return {ok:true, spreadsheetUrl:ss.getUrl(), folderId:p.getProperty('DOC_FOLDER_ID')};
}

function setupAdmin(name, pin) {
  if (!name || !/^\d{4}$/.test(String(pin))) throw new Error('Nome e PIN de 4 dígitos são obrigatórios.');
  setup();
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_NAME: String(name).trim(),
    ADMIN_SALT: salt,
    ADMIN_HASH: hashPin_(String(pin), salt)
  });
  return {ok:true};
}

function apiStatus() {
  var p = PropertiesService.getScriptProperties();
  return {configured:!!p.getProperty('DB_ID'), adminConfigured:!!p.getProperty('ADMIN_HASH')};
}

function signup(name, pin) {
  name = String(name || '').trim();
  pin = String(pin || '');
  if (!name || !/^\d{4}$/.test(pin)) throw new Error('Informe o nome completo e um PIN de exatamente 4 números.');
  setup();
  var sh = sheet_('USERS'), rows = values_('USERS');
  var key = norm_(name);
  if (rows.some(function(r){return r[2] === key;})) throw new Error('Já existe um cadastro com este nome.');
  var id = uid_(), salt = Utilities.getUuid();
  var hash = hashPin_(pin, salt);
  // salt is stored with the hash: salt$hash
  append_('USERS',[id,name,key,salt+'$'+hash,'candidate','pending',now_()]);
  var token = createSession_(id,'candidate',name,'pending');
  audit_(id,'signup','candidate',id,{});
  return {ok:true,token:token,user:{id:id,name:name,role:'candidate',status:'pending'}};
}

function login(name, pin) {
  name = String(name || '').trim(); pin = String(pin || '');
  if (!name || !/^\d{4}$/.test(pin)) throw new Error('Nome e PIN de 4 dígitos são obrigatórios.');
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('ADMIN_NAME') && norm_(name) === norm_(p.getProperty('ADMIN_NAME'))) {
    if (hashPin_(pin,p.getProperty('ADMIN_SALT')) !== p.getProperty('ADMIN_HASH')) throw new Error('Nome ou PIN inválido.');
    var t = createSession_('ADMIN','admin',p.getProperty('ADMIN_NAME'),'active');
    return {ok:true,token:t,user:{id:'ADMIN',name:p.getProperty('ADMIN_NAME'),role:'admin',status:'active'}};
  }
  var row = find_('USERS',function(r){return r[2]===norm_(name);});
  if (!row || row[4] !== 'candidate') throw new Error('Nome ou PIN inválido.');
  var parts = String(row[3]).split('$');
  if (parts.length !== 2 || hashPin_(pin,parts[0]) !== parts[1]) throw new Error('Nome ou PIN inválido.');
  var token = createSession_(row[0],'candidate',row[1],row[5]);
  return {ok:true,token:token,user:{id:row[0],name:row[1],role:'candidate',status:row[5]}};
}

function logout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('SESSION_'+token);
  return {ok:true};
}

function me(token) {
  var s = session_(token);
  if (!s) return {authenticated:false};
  return {authenticated:true,user:{id:s.id,name:s.name,role:s.role,status:s.status}};
}

function candidateHome(token) {
  var s = require_(token,'candidate');
  var docs = values_('DOCS').filter(function(r){return r[1]===s.id;}).map(doc_);
  var attempts = values_('ATTEMPTS').filter(function(r){return r[2]===s.id;}).map(attempt_);
  var cnd = find_('CNDS',function(r){return r[1]===s.id;});
  return {user:{id:s.id,name:s.name,status:s.status},documents:docs,attempts:attempts,cnd:cnd?cndObj_(cnd):null,exams:listOpenExams_(s)};
}

function uploadDocument(token,file) {
  var s = require_(token,'candidate');
  if (!file || !file.name || !file.base64) throw new Error('Arquivo inválido.');
  var mime = String(file.mimeType||'application/octet-stream').toLowerCase();
  var allowed = ['application/pdf','image/jpeg','image/png'];
  if (allowed.indexOf(mime)<0) throw new Error('Envie PDF, JPG ou PNG.');
  if (String(file.base64).length > 15000000) throw new Error('Arquivo muito grande. Limite recomendado: 10 MB.');
  var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('DOC_FOLDER_ID'));
  var bytes = Utilities.base64Decode(String(file.base64));
  var blob = Utilities.newBlob(bytes,mime,String(file.name));
  var f = folder.createFile(blob);
  append_('DOCS',[uid_(),s.id,f.getName(),f.getId(),f.getUrl(),'pending','','','',now_()]);
  audit_(s.id,'document_upload','document',f.getId(),{name:f.getName()});
  return {ok:true};
}

function listMyDocuments(token) {
  var s=require_(token,'candidate');
  return values_('DOCS').filter(function(r){return r[1]===s.id;}).map(doc_);
}

function listOpenExams(token) {
  var s=require_(token,'candidate');
  if (s.status!=='eligible') return [];
  return listOpenExams_(s);
}

function startExam(token,examId) {
  var s=require_(token,'candidate');
  if (s.status!=='eligible') throw new Error('Seu cadastro ainda não está habilitado para o exame.');
  var ex=find_('EXAMS',function(r){return r[0]===examId && r[3]==='open';});
  if(!ex) throw new Error('Exame não encontrado ou encerrado.');
  var attempts=values_('ATTEMPTS').filter(function(r){return r[1]===examId&&r[2]===s.id;});
  var active=attempts.filter(function(r){return !r[7];})[0];
  if(active) return examPayload_(ex,active,s);
  if(attempts.length >= Number(ex[6]||1)) throw new Error('Limite de tentativas atingido.');
  var a=[uid_(),examId,s.id,0,0,false,now_(),' ',now_()];
  // blank submittedAt means active; Apps Script Sheets stores empty strings safely.
  a[7]='';
  append_('ATTEMPTS',a);
  active=find_('ATTEMPTS',function(r){return r[0]===a[0];});
  return examPayload_(ex,active,s);
}

function submitExam(token,attemptId,answers) {
  var s=require_(token,'candidate');
  var a=find_('ATTEMPTS',function(r){return r[0]===attemptId && r[2]===s.id;});
  if(!a || a[7]) throw new Error('Tentativa inválida ou já finalizada.');
  var ex=find_('EXAMS',function(r){return r[0]===a[1];});
  if(!ex) throw new Error('Exame não encontrado.');
  var elapsed=(Date.now()-new Date(a[6]).getTime())/60000;
  if(ex[5] && elapsed > Number(ex[5])+0.1) {
    updateRow_('ATTEMPTS',a[0],7,now_());
    throw new Error('O tempo da prova terminou.');
  }
  var qs=values_('QUESTIONS').filter(function(r){return r[1]===ex[0];});
  var alts=values_('ALTS');
  var total=0, score=0, answerRows=[];
  (answers||[]).forEach(function(ans){
    var q=qs.filter(function(r){return r[0]===ans.questionId;})[0];
    var alt=alts.filter(function(r){return r[0]===ans.alternativeId && r[1]===ans.questionId;})[0];
    if(!q || !alt) return;
    var pts=Number(q[4]||1); total+=pts;
    if(String(alt[4])==='true' || alt[4]===true) score+=pts;
    answerRows.push([uid_(),attemptId,q[0],alt[0]]);
  });
  if(!total) total=qs.reduce(function(n,q){return n+Number(q[4]||1);},0);
  var pct=total?Math.round((score/total)*10000)/100:0;
  var passed=pct>=Number(ex[4]||60);
  updateRow_('ATTEMPTS',a[0],3,score);
  updateRow_('ATTEMPTS',a[0],4,total);
  updateRow_('ATTEMPTS',a[0],5,passed);
  updateRow_('ATTEMPTS',a[0],7,now_());
  if(answerRows.length) sheet_('ANSWERS').getRange(sheet_('ANSWERS').getLastRow()+1,1,answerRows.length,4).setValues(answerRows);
  audit_(s.id,'exam_submit','attempt',attemptId,{score:score,maxScore:total,percent:pct,passed:passed});
  var cnd=null;
  if(passed) cnd=issueCndForCandidate_(s.id);
  return {ok:true,score:score,maxScore:total,percent:pct,passed:passed,cnd:cnd?cndObj_(cnd):null};
}

function publicVerify(number) {
  number=String(number||'').trim();
  var r=find_('CNDS',function(x){return x[2]===number;});
  if(!r) return {valid:false};
  var u=find_('USERS',function(x){return x[0]===r[1];});
  return {valid:true,number:r[2],issuedAt:String(r[3]),status:r[4],holder:u?u[1]:'',institution:'CND Docente'};
}

/* ADMIN */
function adminStats(token) {
  require_(token,'admin');
  var users=values_('USERS'), docs=values_('DOCS'), exams=values_('EXAMS'), cnds=values_('CNDS');
  return {candidates:users.filter(function(r){return r[4]==='candidate';}).length,pendingDocs:docs.filter(function(r){return r[5]==='pending';}).length,openExams:exams.filter(function(r){return r[3]==='open';}).length,cnds:cnds.length};
}

function adminCandidates(token) {
  require_(token,'admin');
  var users=values_('USERS').filter(function(r){return r[4]==='candidate';});
  return users.map(function(u){
    return {id:u[0],name:u[1],status:u[5],createdAt:String(u[6]),documents:values_('DOCS').filter(function(d){return d[1]===u[0];}).map(doc_),attempts:values_('ATTEMPTS').filter(function(a){return a[2]===u[0];}).map(attempt_),cnd:(find_('CNDS',function(c){return c[1]===u[0];})||null)};
  });
}

function reviewDocument(token,docId,status,note) {
  var admin=require_(token,'admin');
  if(['approved','rejected','pending'].indexOf(status)<0) throw new Error('Status inválido.');
  var d=find_('DOCS',function(r){return r[0]===docId;});
  if(!d) throw new Error('Documento não encontrado.');
  updateRow_('DOCS',docId,5,status);
  updateRow_('DOCS',docId,6,String(note||''));
  updateRow_('DOCS',docId,7,admin.id);
  updateRow_('DOCS',docId,8,now_());
  recalcCandidate_(d[1]);
  audit_(admin.id,'document_review','document',docId,{status:status,note:String(note||'')});
  return {ok:true};
}

function adminExams(token) {
  require_(token,'admin');
  return values_('EXAMS').map(function(r){
    return {id:r[0],title:r[1],description:r[2],status:r[3],passingPercent:Number(r[4]),timeLimitMinutes:Number(r[5]||0),maxAttempts:Number(r[6]||1),questions:values_('QUESTIONS').filter(function(q){return q[1]===r[0];}).length};
  });
}

function saveExam(token,data) {
  var s=require_(token,'admin');
  if(!data.title) throw new Error('Título obrigatório.');
  var id=uid_();
  append_('EXAMS',[id,String(data.title),String(data.description||''),String(data.status||'draft'),Number(data.passingPercent||60),Number(data.timeLimitMinutes||0),Number(data.maxAttempts||1),now_()]);
  audit_(s.id,'exam_create','exam',id,{});
  return {ok:true,id:id};
}

function setExamStatus(token,id,status) {
  var s=require_(token,'admin');
  if(['draft','open','closed'].indexOf(status)<0) throw new Error('Status inválido.');
  updateRow_('EXAMS',id,3,status); audit_(s.id,'exam_status','exam',id,{status:status}); return {ok:true};
}

function adminQuestions(token,examId) {
  require_(token,'admin');
  var qs=values_('QUESTIONS').filter(function(q){return q[1]===examId;});
  var alts=values_('ALTS');
  return qs.map(function(q){return {id:q[0],statement:q[2],imageUrl:q[3],points:Number(q[4]||1),orderIndex:Number(q[5]||0),alternatives:alts.filter(function(a){return a[1]===q[0];}).map(function(a){return {id:a[0],text:a[2],orderIndex:Number(a[3]||0),isCorrect:a[4]===true||String(a[4])==='true'};})};});
}

function saveQuestion(token,data) {
  var s=require_(token,'admin');
  if(!data.examId || !data.statement) throw new Error('Exame e enunciado são obrigatórios.');
  var qid=uid_();
  append_('QUESTIONS',[qid,data.examId,String(data.statement),String(data.imageUrl||''),Number(data.points||1),Number(data.orderIndex||0)]);
  (data.alternatives||[]).forEach(function(a,i){append_('ALTS',[uid_(),qid,String(a.text||''),i,!!a.isCorrect]);});
  audit_(s.id,'question_create','question',qid,{examId:data.examId});
  return {ok:true,id:qid};
}

function adminIssueCnd(token,candidateId) {
  var s=require_(token,'admin');
  var passed=values_('ATTEMPTS').some(function(a){return a[2]===candidateId && (a[5]===true||String(a[5])==='true');});
  if(!passed) throw new Error('O candidato ainda não possui aprovação em exame.');
  var c=issueCndForCandidate_(candidateId);
  audit_(s.id,'cnd_issue','cnd',c[0],{candidateId:candidateId});
  return cndObj_(c);
}

/* HELPERS */
function issueCndForCandidate_(candidateId) {
  var old=find_('CNDS',function(r){return r[1]===candidateId;});
  if(old) return old;
  var n=nextCndNumber_();
  var row=[uid_(),candidateId,n,now_(),'active'];
  append_('CNDS',row);
  return row;
}
function nextCndNumber_() {
  var n=values_('CNDS').length;
  return 'CND-2026-'+String(n+1).padStart(6,'0');
}
function listOpenExams_(s) {
  return values_('EXAMS').filter(function(r){return r[3]==='open';}).map(function(r){return {id:r[0],title:r[1],description:r[2],passingPercent:Number(r[4]),timeLimitMinutes:Number(r[5]||0),maxAttempts:Number(r[6]||1),questions:values_('QUESTIONS').filter(function(q){return q[1]===r[0];}).length};});
}
function examPayload_(ex,a,s) {
  var qs=values_('QUESTIONS').filter(function(q){return q[1]===ex[0];}).sort(function(x,y){return Number(x[5])-Number(y[5]);});
  var alts=values_('ALTS');
  return {attemptId:a[0],startedAt:String(a[6]),exam:{id:ex[0],title:ex[1],description:ex[2],passingPercent:Number(ex[4]),timeLimitMinutes:Number(ex[5]||0),maxAttempts:Number(ex[6]||1)},questions:qs.map(function(q){return {id:q[0],statement:q[2],imageUrl:q[3],points:Number(q[4]||1),alternatives:alts.filter(function(a){return a[1]===q[0];}).sort(function(x,y){return Number(x[3])-Number(y[3]);}).map(function(a){return {id:a[0],text:a[2]};})};})};
}
function recalcCandidate_(candidateId) {
  var ds=values_('DOCS').filter(function(r){return r[1]===candidateId;});
  var status='pending';
  if(ds.some(function(r){return r[5]==='rejected';})) status='rejected';
  else if(ds.length && ds.every(function(r){return r[5]==='approved';})) status='eligible';
  updateRow_('USERS',candidateId,5,status);
}
function doc_(r){return {id:r[0],candidateId:r[1],fileName:r[2],fileId:r[3],fileUrl:r[4],status:r[5],note:r[6],createdAt:String(r[9])};}
function attempt_(r){return {id:r[0],examId:r[1],score:Number(r[3]||0),maxScore:Number(r[4]||0),passed:r[5]===true||String(r[5])==='true',startedAt:String(r[6]),submittedAt:r[7]?String(r[7]):''};}
function cndObj_(r){return {id:r[0],candidateId:r[1],number:r[2],issuedAt:String(r[3]),status:r[4]};}
function uid_(){return Utilities.getUuid();}
function now_(){return new Date().toISOString();}
function norm_(s){return String(s||'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');}
function hashPin_(pin,salt){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(salt)+'|'+String(pin)));}
function createSession_(id,role,name,status){var token=Utilities.getUuid()+'-'+Utilities.getUuid();PropertiesService.getScriptProperties().setProperty('SESSION_'+token,JSON.stringify({id:id,role:role,name:name,status:status,createdAt:Date.now()}));return token;}
function session_(token){if(!token)return null;var v=PropertiesService.getScriptProperties().getProperty('SESSION_'+token);if(!v)return null;try{var s=JSON.parse(v);if(Date.now()-s.createdAt>1000*60*60*24*7){PropertiesService.getScriptProperties().deleteProperty('SESSION_'+token);return null;}return s;}catch(e){return null;}}
function require_(token,role){var s=session_(token);if(!s)throw new Error('Sessão expirada.');if(role&&s.role!==role)throw new Error('Acesso não autorizado.');return s;}
function ss_(){var id=PropertiesService.getScriptProperties().getProperty('DB_ID');if(!id){setup();id=PropertiesService.getScriptProperties().getProperty('DB_ID');}return SpreadsheetApp.openById(id);}
function sheet_(name){return ss_().getSheetByName(name);}
function values_(name){var sh=sheet_(name);if(sh.getLastRow()<2)return [];return sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();}
function append_(name,row){sheet_(name).appendRow(row);}
function find_(name,fn){var rows=values_(name);for(var i=0;i<rows.length;i++)if(fn(rows[i]))return rows[i];return null;}
function updateRow_(name,id,col,value){var sh=sheet_(name),rows=values_(name);for(var i=0;i<rows.length;i++){if(rows[i][0]===id){sh.getRange(i+2,col+1).setValue(value);return true;}}throw new Error('Registro não encontrado.');}
function audit_(actor,action,type,id,meta){try{append_('LOGS',[uid_(),actor,action,type,id,JSON.stringify(meta||{}),now_()]);}catch(e){}}
