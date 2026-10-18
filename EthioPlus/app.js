function speak(t){
  if(!("speechSynthesis" in window))return;
  const u=new SpeechSynthesisUtterance(t);u.lang="am-ET";
  speechSynthesis.cancel();speechSynthesis.speak(u);
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("on",x===b));
  document.querySelectorAll("main section").forEach(s=>s.hidden=s.id!==b.dataset.tab);
});
// Alphabet
const t=document.getElementById("fidel");
t.innerHTML="<tr><th></th>"+VOWELS.map(v=>`<th>${v}</th>`).join("")+"</tr>"+
  FIDEL.map(r=>`<tr><th>${r.c}</th>`+r.forms.map(f=>`<td>${f}</td>`).join("")+"</tr>").join("");
t.onclick=e=>{if(e.target.tagName==="TD")speak(e.target.textContent)};
// Words
const cats=["All",...new Set(WORDS.map(w=>w.cat))];
const catsEl=document.getElementById("cats"),cards=document.getElementById("cards");
function showCat(c){
  catsEl.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.textContent===c));
  cards.innerHTML=WORDS.filter(w=>c==="All"||w.cat===c).map(w=>
    `<div class="card" data-am="${w.am}"><b>${w.am}</b><i>${w.rom}</i><div>${w.en}</div></div>`).join("");
}
catsEl.innerHTML=cats.map(c=>`<button>${c}</button>`).join("");
catsEl.onclick=e=>{if(e.target.tagName==="BUTTON")showCat(e.target.textContent)};
cards.onclick=e=>{const c=e.target.closest(".card");if(c)speak(c.dataset.am)};
showCat("All");
// Quiz
let right=0,total=0;
const shuffle=a=>a.map(x=>[Math.random(),x]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
function ask(){
  const w=WORDS[Math.floor(Math.random()*WORDS.length)];
  const opts=shuffle([w,...shuffle(WORDS.filter(x=>x!==w)).slice(0,3)]);
  const q=document.getElementById("q");
  q.innerHTML=`<div class="word">${w.am}<br><small>${w.rom}</small></div><div class="opts">`+
    opts.map(o=>`<button class="opt">${o.en}</button>`).join("")+"</div>";
  q.querySelectorAll(".opt").forEach((b,i)=>b.onclick=()=>{
    total++;const ok=opts[i]===w;if(ok)right++;
    b.classList.add(ok?"ok":"bad");
    q.querySelectorAll(".opt").forEach(x=>x.disabled=true);
    document.getElementById("score").textContent=`Score: ${right} / ${total}`;
    setTimeout(ask,900);
  });
}
ask();
