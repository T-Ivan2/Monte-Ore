// Consegna un file all'utente. Sul telefono apre il menu di condivisione (Salva su File, Mail, WhatsApp…),
// sul computer lo scarica. Restituisce 'shared', 'cancelled' o 'downloaded'.
export async function saveFile(file) {
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return 'shared'; }
    catch (err) { if (err.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
