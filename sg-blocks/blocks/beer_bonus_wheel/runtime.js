
function q(root,s){return root.querySelector(s);}
function setDisabled(btn, v){ if (btn) btn.disabled = !!v; }
function pickIndex(n){ return Math.floor(Math.random()*n); }

export function mount(root, props, ctx){
  const track = q(root,'.wheel-track');
  const bonuses = track ? Array.from(track.querySelectorAll('.bonus')) : [];
  const btns = root.querySelectorAll('.actions .btn');
  const btnSpin = btns && btns.length ? btns[0] : null;
  const btnClaim = btns && btns.length>1 ? btns[1] : null;
  const pill = q(root,'.picked-pill');

  let picked=-1;

  const onSpin = ()=>{
    if (bonuses.length===0) return;
    picked = pickIndex(bonuses.length);
    bonuses.forEach((b,i)=> b.classList.toggle('is-picked', i===picked));
    if (pill) pill.textContent = '🎁 Выпало: ' + (bonuses[picked].innerText||'');
    setDisabled(btnSpin,true);
    setDisabled(btnClaim,false);
    try{ window.dispatchEvent(new CustomEvent('sg:beerWheelSpin', {detail: {index:picked}})); }catch(_){}
  };

  const onClaim = ()=>{
    if (picked<0) return;
    setDisabled(btnClaim,true);
    setDisabled(btnSpin,false);
    try{ window.dispatchEvent(new CustomEvent('sg:beerWheelClaim', {detail: {index:picked}})); }catch(_){}
  };

  if (btnSpin) btnSpin.addEventListener('click', onSpin);
  if (btnClaim) btnClaim.addEventListener('click', onClaim);
  setDisabled(btnClaim,true);

  return ()=>{
    if (btnSpin) btnSpin.removeEventListener('click', onSpin);
    if (btnClaim) btnClaim.removeEventListener('click', onClaim);
  };
}
export function unmount(root, ctx){}
