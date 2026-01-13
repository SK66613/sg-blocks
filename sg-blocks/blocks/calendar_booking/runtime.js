export async function mount(root, props, ctx){
  const $ = s => root.querySelector(s);

  const titleWrap = root.querySelector('.blk-head');
  const titleEl   = $('[data-title]');
  const monthEl   = $('.cal-month');
  const monthTitle= $('[data-month-title]');
  const btnPrev   = $('.cal-monthbar .prev');
  const btnNext   = $('.cal-monthbar .next');
  const durWrap   = $('.cal-durations');
  const slotsEl   = $('.cal-slots');
  const btnHold   = $('.cal-hold');
  const btnBook   = $('.cal-book');
  const durTitleEl   = root.querySelector('[data-dur-title]');
  const slotsTitleEl = root.querySelector('[data-slots-title]');
  const srvWrap      = root.querySelector('[data-services-wrap]');
  const srvTitleEl   = root.querySelector('[data-srv-title]');
  const srvListEl    = root.querySelector('[data-services]');

  root.style.setProperty('--radius', ((props.radius ?? 12)) + 'px');
  root.style.setProperty('--gap', ((props.gap ?? 8)) + 'px');

  // Title (hide when empty)
  const userTitle = (typeof props.title === 'string') ? props.title.trim() : '';
  if (userTitle){
    titleEl.textContent = userTitle; titleWrap.style.display = '';
  } else { titleEl.textContent = ''; titleWrap.style.display = 'none'; }

  // Group titles
  const userDurTitle = (typeof props.dur_title === 'string') ? props.dur_title.trim() : 'Длительность';
  durTitleEl.textContent = userDurTitle || ''; durTitleEl.style.display = userDurTitle ? '' : 'none';

  const userSlotsTitle = (typeof props.slots_title === 'string') ? props.slots_title.trim() : 'Свободные слоты';
  slotsTitleEl.textContent = userSlotsTitle || ''; slotsTitleEl.style.display = userSlotsTitle ? '' : 'none';

  // Services render
  const services = Array.isArray(props.services) ? props.services.map(s => (s||'').trim()).filter(Boolean) : [];
  const userSrvTitle = (typeof props.srv_title === 'string') ? props.srv_title.trim() : 'Услуги';
  if (!services.length){
    srvWrap.style.display = 'none';
  } else {
    srvWrap.style.display = '';
    srvTitleEl.textContent = userSrvTitle || ''; srvTitleEl.style.display = userSrvTitle ? '' : 'none';
    srvListEl.innerHTML = services.map((name, i) => `
      <div class="service-row" data-srv="${i}">
        <div class="srv-title">${name}</div>
        <div class="srv-switch" role="switch" aria-checked="false"></div>
      </div>
    `).join('');
  }
  const getSelectedServices = ()=>{
    const out=[];
    root.querySelectorAll('.srv-switch.is-on').forEach(sw=>{
      const i = sw.closest('.service-row').getAttribute('data-srv');
      out.push(services[Number(i)]);
    });
    return out;
  };

  // Buttons: texts + visibility
  btnBook.textContent = (props.text_ok || 'Забронировать');
  btnHold.textContent = (props.text_hold || 'Держать слот');
  const showBook = (props.show_book !== false);
  const showHold = (props.show_hold !== false);
  btnBook.parentElement.style.display = showBook ? '' : 'none';
  btnHold.parentElement.style.display = showHold ? '' : 'none';

  // Durations
  const allowed = (Array.isArray(props.allowed_minutes) ? props.allowed_minutes : [30,60,90])
                  .map(n=>Number(n)).filter(Boolean);
  const durations = allowed.length ? allowed : [60];
  let activeDuration = Number(props.defaultDuration || durations[0] || 60);

  const isPreview = (typeof window.api !== 'function');
  let current = new Date(); current.setDate(1);
  let selectedISO = null;

  const toISO = (y,m,d)=> `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const monthName = (d)=> d.toLocaleDateString('ru-RU', {month:'long', year:'numeric'});
  const clearActive = (sel)=> root.querySelectorAll(sel).forEach(x=>x.classList.remove('is-active'));

  function renderDurations(){
    durWrap.innerHTML = durations.map(v => `<button type="button" class="chip${v===activeDuration?' is-active':''}" data-min="${v}">${v} мин</button>`).join('');
  }

  function renderMonth(){
    monthTitle.textContent = monthName(current);
    const y = current.getFullYear(), m = current.getMonth();
    const days = new Date(y, m+1, 0).getDate();
    const start = (new Date(y, m, 1).getDay() + 6) % 7;

    monthEl.innerHTML = '';
    for (let i=0;i<start;i++) monthEl.insertAdjacentHTML('beforeend','<div class="day disabled"></div>');
    for (let d=1; d<=days; d++){
      const iso = toISO(y,m,d);
      const today = (()=>{ const t=new Date(); return t.getFullYear()===y && t.getMonth()===m && t.getDate()===d; })();
      monthEl.insertAdjacentHTML('beforeend', `<div class="day${today?' today':''}${iso===selectedISO?' is-active':''}" data-date="${iso}">${d}</div>`);
    }
  }

  async function loadSlots(){
    if (!selectedISO){ slotsEl.innerHTML=''; return; }
    const dur = activeDuration;
    if (isPreview){
      const demo = ['10:00','10:30','11:00','12:30','13:00','15:00','16:30'];
      slotsEl.innerHTML = demo.map(h=>`<button class="slot" data-hh="${h}">${h}</button>`).join('');
      return;
    }
    try{
      const r = await window.api('calendar.free_slots', { date: selectedISO, duration_min: dur });
      const arr = r?.ok && Array.isArray(r.slots) ? r.slots : [];
      slotsEl.innerHTML = arr.length ? arr.map(h=>`<button class="slot" data-hh="${h}">${h}</button>`).join('')
                                     : '<div class="muted-sm">Нет слотов</div>';
    }catch(e){
      console.warn('calendar.free_slots error', e);
      slotsEl.innerHTML = '<div class="muted-sm">Ошибка загрузки</div>';
    }
  }

  btnPrev.addEventListener('click', ()=>{ current.setMonth(current.getMonth()-1); renderMonth(); });
  btnNext.addEventListener('click', ()=>{ current.setMonth(current.getMonth()+1); renderMonth(); });

  root.addEventListener('click', async (e)=>{
    const day = e.target.closest('.day');
    if (day && !day.classList.contains('disabled')){
      selectedISO = day.dataset.date;
      clearActive('.day.is-active'); day.classList.add('is-active');
      await loadSlots();
      return;
    }
    const chip = e.target.closest('.chip');
    if (chip){
      activeDuration = Number(chip.dataset.min);
      clearActive('.chip.is-active'); chip.classList.add('is-active');
      if (selectedISO) await loadSlots();
      return;
    }
    const slot = e.target.closest('.slot');
    if (slot){ clearActive('.slot.is-active'); slot.classList.add('is-active'); return; }

    // Services toggles
    const sw = e.target.closest('.srv-switch');
    if (sw){
      sw.classList.toggle('is-on');
      sw.setAttribute('aria-checked', sw.classList.contains('is-on') ? 'true' : 'false');
      return;
    }

    if (e.target.closest('.cal-hold')){
      const hh = root.querySelector('.slot.is-active')?.dataset.hh; if (!hh || isPreview) return;
      await window.api('calendar.hold', { date: selectedISO, time: hh, duration_min: activeDuration, services: getSelectedServices() });
      await loadSlots(); return;
    }
    if (e.target.closest('.cal-book')){
      const hh = root.querySelector('.slot.is-active')?.dataset.hh; if (!hh || isPreview) return;
      const r = await window.api('calendar.book', { date: selectedISO, time: hh, duration_min: activeDuration, contact: '', format: 'tg_call', services: getSelectedServices() });
      if (r?.ok) await loadSlots(); else alert(r?.error==='slot_full'?'Слот занят':'Ошибка');
      return;
    }
  });

  renderDurations();
  renderMonth();
  const t = new Date(); selectedISO = toISO(t.getFullYear(), t.getMonth(), t.getDate());
  const el = root.querySelector(`.day[data-date="${selectedISO}"]`);
  if (el){ clearActive('.day.is-active'); el.classList.add('is-active'); }
  await loadSlots();
}
