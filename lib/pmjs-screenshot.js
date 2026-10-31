'use strict';
// F12 saves the screen as a PNG (TUXTAVERN_SCREENSHOTS), from NW.js's capturePage as PMJS gives it:
// the frame as presented. TuxTavern bundles this into a PMJS adapter.

const stamp = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('') +
  '-' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join('');

function install(w, dir, name) {
  const fs = w.require('fs'), path = w.require('path');
  let busy = false;
  w.document.addEventListener('keydown', e => {
    if (e.keyCode !== 123 || e.repeat || busy) return;
    busy = true;
    w.nw.Window.get().capturePage(png => {
      busy = false;
      try {
        fs.mkdirSync(dir, { recursive: true });
        const base = path.join(dir, `${name}-${stamp(new Date())}`);
        let file = base + '.png';
        for (let i = 2; fs.existsSync(file); i++) file = `${base}-${i}.png`;
        fs.writeFileSync(file, png, { flag: 'wx' });
        console.log('tuxtavern: screenshot saved to ' + file);
      } catch (error) {
        console.log('tuxtavern: screenshot not saved: ' + error.message);
      }
    }, { format: 'png', datatype: 'buffer' });
  });
}

module.exports = { install, stamp };
