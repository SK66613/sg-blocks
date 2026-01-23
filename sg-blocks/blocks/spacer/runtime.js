export async function mount(root, props){
  const h = Number(props?.size);
  root.style.height = (Number.isFinite(h) && h >= 0 ? h : 16) + 'px';
}
