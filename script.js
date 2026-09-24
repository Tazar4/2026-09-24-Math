(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  const superscriptMap = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
  const isMonoChar = ch => /[A-Za-z0-9.]/.test(ch) || Object.prototype.hasOwnProperty.call(superscriptMap, ch);

  function stripOuterGroup(value){
    const s=value.trim();
    const pairs={'(':')','[':']','{':'}'};
    const close=pairs[s[0]];
    if(!close || s[s.length-1]!==close) return s;
    let depth=0;
    for(let i=0;i<s.length;i++){
      if(s[i]===s[0]) depth++;
      else if(s[i]===close) depth--;
      if(depth===0 && i<s.length-1) return s;
    }
    return s.slice(1,-1).trim();
  }

  function texSymbols(value){
    let out='';
    for(const ch of value){
      if(Object.prototype.hasOwnProperty.call(superscriptMap,ch)) out+=`^{${superscriptMap[ch]}}`;
      else out+=ch;
    }
    return out
      .replaceAll('−','-')
      .replaceAll('×','\\times ')
      .replaceAll('→','\\to ')
      .replaceAll('≠','\\ne ')
      .replaceAll('·','\\cdot ');
  }

  function leftOperandBounds(text, slash){
    let end=slash;
    let j=slash-1;
    while(j>=0 && /\s/.test(text[j])) j--;
    if(j<0) return null;

    // Include a superscript after a grouped factor, e.g. (a-3)²/(...).
    while(j>=0 && Object.prototype.hasOwnProperty.call(superscriptMap,text[j])) j--;
    if(j>=0 && (text[j]===')' || text[j]===']' || text[j]==='}')){
      const close=text[j], open=close===')'?'(':close===']'?'[':'{';
      let depth=1; j--;
      while(j>=0 && depth){
        if(text[j]===close) depth++;
        else if(text[j]===open) depth--;
        j--;
      }
      if(depth) return null;
      return [j+1,end];
    }

    j=slash-1;
    while(j>=0 && /\s/.test(text[j])) j--;
    while(j>=0 && isMonoChar(text[j])) j--;
    return [j+1,end];
  }

  function rightOperandBounds(text, slash){
    let j=slash+1;
    while(j<text.length && /\s/.test(text[j])) j++;
    if(j>=text.length) return null;
    const start=j;
    if(text[j]==='(' || text[j]==='[' || text[j]==='{'){
      const open=text[j], close=open==='('?')':open==='['?']':'}';
      let depth=1; j++;
      while(j<text.length && depth){
        if(text[j]===open) depth++;
        else if(text[j]===close) depth--;
        j++;
      }
      if(depth) return null;
      while(j<text.length && Object.prototype.hasOwnProperty.call(superscriptMap,text[j])) j++;
      return [start,j];
    }
    while(j<text.length && isMonoChar(text[j])) j++;
    return [start,j];
  }

  function fractionChunkToTex(chunk){
    let value=chunk;
    let guard=0;
    while(value.includes('/') && guard++<20){
      const slash=value.lastIndexOf('/');
      const left=leftOperandBounds(value,slash), right=rightOperandBounds(value,slash);
      if(!left || !right || left[0]===left[1] || right[0]===right[1]) break;
      const numerator=stripOuterGroup(value.slice(left[0],left[1]));
      const denominator=stripOuterGroup(value.slice(right[0],right[1]));
      const replacement=`\\frac{${texSymbols(numerator)}}{${texSymbols(denominator)}}`;
      value=value.slice(0,left[0])+replacement+value.slice(right[1]);
    }
    return texSymbols(value).replaceAll('\\\\frac','\\frac');
  }

  function formatMathText(text){
    if(!text || !text.includes('/')) return text;
    const allowed = ch => /[A-Za-z0-9²³⁴⁵⁶⁷⁸⁹⁰¹+\-−*/=(){}\[\].?×→≠·\s]/.test(ch);
    let out='', cursor=0;
    while(true){
      const slash=text.indexOf('/',cursor);
      if(slash<0){ out+=text.slice(cursor); break; }
      let start=slash, end=slash+1;
      while(start>cursor && allowed(text[start-1])) start--;
      while(end<text.length && allowed(text[end])) end++;
      let chunk=text.slice(start,end);
      const lead=(chunk.match(/^\s*/) || [''])[0];
      const trail=(chunk.match(/\s*$/) || [''])[0];
      chunk=chunk.trim();
      if(chunk.includes('/') && /[A-Za-z0-9]/.test(chunk)){
        out+=text.slice(cursor,start)+lead+`\\(\\displaystyle ${fractionChunkToTex(chunk)}\\)`+trail;
        cursor=end;
      } else {
        out+=text.slice(cursor,slash+1);
        cursor=slash+1;
      }
    }
    return out;
  }

  function clearTypeset(root){
    try { if(window.MathJax?.typesetClear) window.MathJax.typesetClear([root]); } catch(_) {}
  }

  function typeset(root=document){
    const mj=window.MathJax;
    if(!mj) return Promise.resolve();
    const run=()=>mj.typesetPromise ? mj.typesetPromise([root]).catch(()=>{}) : Promise.resolve();
    return mj.startup?.promise ? mj.startup.promise.then(run).catch(()=>{}) : run();
  }

  const labels = {
    topics: {same:'Одинаковые знаменатели',different:'Разные знаменатели',opposite:'Противоположные знаменатели',mixed:'Целое выражение + дробь'},
    skills: {rule:'Правила',application:'Применение',signs:'Знаки',simplification:'Упрощение',proof:'Доказательство',reverse:'Обратное преобразование','common-denominator':'Общий знаменатель',multiplier:'Доп. множитель',factorization:'Разложение на множители',error:'Поиск ошибки','admissible-values':'Допустимые значения',sequence:'Порядок действий'},
    difficulty:{basic:'Базовый',medium:'Средний',advanced:'Повышенный'}
  };

  const emptyStats = () => ({attempts:0, correct:0, exams:0, byTopic:{}, bySkill:{}});
  let stats = loadStats();
  let practiceCurrent = null;
  let examQuestions = [];
  let examIndex = 0;
  let examAnswers = [];

  function loadStats(){
    try { return JSON.parse(localStorage.getItem('fractionTrainerStats')) || emptyStats(); }
    catch { return emptyStats(); }
  }
  function saveStats(){ localStorage.setItem('fractionTrainerStats', JSON.stringify(stats)); }
  function record(q, correct){
    stats.attempts++; if(correct) stats.correct++;
    if(!stats.byTopic[q.topic]) stats.byTopic[q.topic]={attempts:0,correct:0};
    if(!stats.bySkill[q.skill]) stats.bySkill[q.skill]={attempts:0,correct:0};
    stats.byTopic[q.topic].attempts++; stats.bySkill[q.skill].attempts++;
    if(correct){ stats.byTopic[q.topic].correct++; stats.bySkill[q.skill].correct++; }
    saveStats();
  }

  $$('.tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.tab').forEach(b=>b.classList.remove('active'));
    $$('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('#'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab==='practice') newPracticeQuestion();
    typeset($('#'+btn.dataset.tab));
    if(btn.dataset.tab==='stats') renderStats();
  }));

  $$('[data-interactive]').forEach(group => {
    const feedback = group.parentElement.querySelector('.feedback');
    $$('button',group).forEach(btn=>btn.addEventListener('click',()=>{
      $$('button',group).forEach(b=>{b.classList.remove('correct','wrong'); b.disabled=true;});
      const ok = btn.dataset.correct==='true';
      btn.classList.add(ok?'correct':'wrong');
      if(!ok) $('button[data-correct="true"]',group).classList.add('correct');
      const messages = {
        'first-step': ok?'Верно. При разных знаменателях сначала делаем их одинаковыми.':'Нет. Складывать числители сразу можно только при одинаковых знаменателях.',
        multipliers: ok?'Верно: 12y÷6y=2, а 12y÷4y=3.':'Проверь делением общего знаменателя на исходный.',
        opposite: ok?'Верно: 1−x=−(x−1), поэтому меняется знак всей дроби.':'Знаменатели противоположны, значит нужен знак «−».',
        'error-sign': ok?'Точно. Минус перед скобками меняет оба знака внутри.':'Проверь правило: −(a−2b)=−a+2b.'
      };
      feedback.textContent=messages[group.dataset.interactive];
      feedback.className='feedback '+(ok?'good':'bad');
      setTimeout(()=>{$$('button',group).forEach(b=>b.disabled=false);},500);
    }));
  });

  const correctOrder = [
    'Разложить знаменатели на множители (если нужно)',
    'Найти простейший общий знаменатель',
    'Найти дополнительные множители',
    'Домножить числители и знаменатели',
    'Выполнить сложение или вычитание числителей',
    'Упростить и сократить результат'
  ];
  let orderState=[];
  function shuffle(arr){ return [...arr].sort(()=>Math.random()-.5); }
  function renderOrder(reset=false){
    if(reset || !orderState.length) orderState=shuffle(correctOrder);
    const root=$('#orderGame'); root.innerHTML='';
    orderState.forEach((text,i)=>{
      const item=document.createElement('div'); item.className='order-item';
      item.innerHTML=`<span class="order-num">${i+1}</span><span>${text}</span><span class="order-controls"><button aria-label="Вверх">↑</button><button aria-label="Вниз">↓</button></span>`;
      const [up,down]=$$('button',item);
      up.disabled=i===0; down.disabled=i===orderState.length-1;
      up.addEventListener('click',()=>{[orderState[i-1],orderState[i]]=[orderState[i],orderState[i-1]];renderOrder();});
      down.addEventListener('click',()=>{[orderState[i+1],orderState[i]]=[orderState[i],orderState[i+1]];renderOrder();});
      root.appendChild(item);
    });
  }
  renderOrder(true);
  $('#resetOrder').addEventListener('click',()=>{renderOrder(true);$('#orderFeedback').textContent='';});
  $('#checkOrder').addEventListener('click',()=>{
    const ok=orderState.every((x,i)=>x===correctOrder[i]);
    $('#orderFeedback').textContent=ok?'Отлично. Это правильный алгоритм.':'Пока не так. Подсказка: действие с числителями возможно только после приведения к общему знаменателю.';
    $('#orderFeedback').className='feedback '+(ok?'good':'bad');
  });

  function pickPractice(){
    const topic=$('#practiceTopic').value, diff=$('#practiceDifficulty').value;
    const pool=QUESTIONS.filter(q=>(topic==='all'||q.topic===topic)&&(diff==='all'||q.difficulty===diff));
    return pool[Math.floor(Math.random()*pool.length)] || QUESTIONS[0];
  }
  function newPracticeQuestion(){ practiceCurrent=pickPractice(); renderPractice(practiceCurrent); }
  function renderPractice(q){
    const root=$('#practiceCard');
    clearTypeset(root);
    root.innerHTML=`
      <div class="quiz-meta"><span class="meta-pill">${q.section}</span><span class="meta-pill">${labels.topics[q.topic]}</span><span class="meta-pill">${labels.skills[q.skill]}</span><span class="meta-pill">${labels.difficulty[q.difficulty]}</span></div>
      <div class="quiz-prompt">${formatMathText(q.prompt)}</div>
      <div class="options">${q.options.map((o,i)=>`<button class="option-btn" data-i="${i}">${formatMathText(o)}</button>`).join('')}</div>
      <div class="explanation hidden"></div>
      <div class="quiz-footer"><span class="micro">После ответа сразу появится объяснение.</span><button class="primary hidden" id="nextPractice">Следующее</button></div>`;
    typeset(root);
    $$('.option-btn',root).forEach(btn=>btn.addEventListener('click',()=>{
      const chosen=Number(btn.dataset.i), ok=chosen===q.answer;
      $$('.option-btn',root).forEach((b,i)=>{b.disabled=true;if(i===q.answer)b.classList.add('correct');});
      if(!ok) btn.classList.add('wrong');
      const expl=$('.explanation',root); expl.classList.remove('hidden');
      expl.innerHTML=`<b>${ok?'Верно.':'Неверно.'}</b> ${formatMathText(q.explanation)}`;
      typeset(expl);
      record(q,ok);
      $('#nextPractice').classList.remove('hidden');
    }));
    $('#nextPractice')?.addEventListener('click',newPracticeQuestion);
  }
  $('#practiceTopic').addEventListener('change',newPracticeQuestion);
  $('#practiceDifficulty').addEventListener('change',newPracticeQuestion);

  function makeExam(){
    const groups=['same','different','opposite','mixed'];
    const chosen=[];
    groups.forEach(topic=>chosen.push(...shuffle(QUESTIONS.filter(q=>q.topic===topic)).slice(0,2)));
    const remaining=shuffle(QUESTIONS.filter(q=>!chosen.some(c=>c.id===q.id)));
    chosen.push(...remaining.slice(0,4));
    return shuffle(chosen).slice(0,12);
  }
  $('#startExam').addEventListener('click',()=>{
    examQuestions=makeExam(); examIndex=0; examAnswers=[];
    $('#examIntro').classList.add('hidden'); $('#examArea').classList.remove('hidden'); renderExamQuestion();
  });
  function renderExamQuestion(){
    const q=examQuestions[examIndex], root=$('#examArea');
    clearTypeset(root);
    root.innerHTML=`<div class="exam-question card">
      <div class="exam-status"><span>Задание ${examIndex+1} из ${examQuestions.length}</span><span>${labels.topics[q.topic]}</span></div>
      <div class="progress"><span style="width:${(examIndex/examQuestions.length)*100}%"></span></div>
      <div class="quiz-prompt">${formatMathText(q.prompt)}</div>
      <div class="options">${q.options.map((o,i)=>`<button class="option-btn" data-i="${i}">${formatMathText(o)}</button>`).join('')}</div>
    </div>`;
    typeset(root);
    $$('.option-btn',root).forEach(btn=>btn.addEventListener('click',()=>{
      examAnswers.push({q,chosen:Number(btn.dataset.i),correct:Number(btn.dataset.i)===q.answer});
      examIndex++;
      examIndex<examQuestions.length?renderExamQuestion():finishExam();
    }));
  }
  function finishExam(){
    const correct=examAnswers.filter(a=>a.correct).length, pct=Math.round(correct/examAnswers.length*100);
    stats.exams++;
    examAnswers.forEach(a=>record(a.q,a.correct)); saveStats();
    const wrong=examAnswers.filter(a=>!a.correct);
    const byTopic={}; wrong.forEach(a=>byTopic[a.q.topic]=(byTopic[a.q.topic]||0)+1);
    const review=Object.entries(byTopic).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`<div class="weak-item">${labels.topics[t]} — ошибок: ${n}</div>`).join('') || '<p class="feedback good">Ошибок нет.</p>';
    $('#examArea').innerHTML=`<div class="card wide center"><span class="badge">Результат</span><h2>${correct} из ${examAnswers.length} · ${pct}%</h2><p>${pct>=85?'Очень уверенное владение темой.':pct>=65?'Основа есть; полезно разобрать темы ошибок.':'Нужно ещё пройти пошаговые примеры и потренироваться.'}</p><div style="text-align:left;max-width:620px;margin:18px auto"><h3>Темы ошибок</h3>${review}</div><button id="restartExam" class="primary">Пройти ещё раз</button></div>`;
    $('#restartExam').addEventListener('click',()=>{examQuestions=makeExam();examIndex=0;examAnswers=[];renderExamQuestion();});
  }

  function percent(obj){ return obj&&obj.attempts?Math.round(obj.correct/obj.attempts*100):0; }
  function statRows(data, map){
    const entries=Object.entries(data);
    if(!entries.length) return '<p class="micro">Пока нет данных.</p>';
    return entries.sort((a,b)=>percent(a[1])-percent(b[1])).map(([k,v])=>`<div class="stat-row"><span>${map[k]||k}</span><div class="bar"><span style="width:${percent(v)}%"></span></div><b>${percent(v)}%</b></div>`).join('');
  }
  function renderStats(){
    const pct=stats.attempts?Math.round(stats.correct/stats.attempts*100):0;
    $('#statsSummary').innerHTML=`<div class="stat-card"><div class="num">${stats.attempts}</div><div class="label">выполнено заданий</div></div><div class="stat-card"><div class="num">${stats.correct}</div><div class="label">правильных</div></div><div class="stat-card"><div class="num">${pct}%</div><div class="label">точность</div></div><div class="stat-card"><div class="num">${stats.exams}</div><div class="label">пройдено опросов</div></div>`;
    $('#topicStats').innerHTML=statRows(stats.byTopic,labels.topics);
    $('#skillStats').innerHTML=statRows(stats.bySkill,labels.skills);
    const weak=[];
    Object.entries(stats.byTopic).forEach(([k,v])=>{if(v.attempts>=2&&percent(v)<70)weak.push(`${labels.topics[k]} — ${percent(v)}%`);});
    Object.entries(stats.bySkill).forEach(([k,v])=>{if(v.attempts>=2&&percent(v)<70)weak.push(`${labels.skills[k]} — ${percent(v)}%`);});
    $('#weakAreas').innerHTML=weak.length?weak.map(x=>`<div class="weak-item">${x}</div>`).join(''):'<p class="micro">Слабые зоны появятся после нескольких заданий.</p>';
  }

  $('#resetStats').addEventListener('click',()=>{
    if(confirm('Сбросить всю локальную статистику?')){stats=emptyStats();saveStats();renderStats();}
  });

  newPracticeQuestion();
  typeset(document);
})();
