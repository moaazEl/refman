'use strict';
(() => {
  const key='refman.appearance';
  const choices=new Set(['system','light','dark']);
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  let preference='system';
  try{const saved=localStorage.getItem(key);if(choices.has(saved))preference=saved;}catch{}
  function apply(){document.documentElement.dataset.theme=preference==='system'?(system.matches?'dark':'light'):preference;document.documentElement.dataset.appearance=preference;}
  apply();
  system.addEventListener('change',()=>{if(preference==='system')apply();});
  document.addEventListener('DOMContentLoaded',()=>{const select=document.getElementById('appearance');select.value=preference;select.addEventListener('change',()=>{if(!choices.has(select.value))return;preference=select.value;try{localStorage.setItem(key,preference);}catch{}apply();});});
})();
