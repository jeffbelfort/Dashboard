const logEl = document.getElementById('log');
const backendDot = document.getElementById('backend-dot');
const frontendDot = document.getElementById('frontend-dot');
const setupBanner = document.getElementById('setup-banner');

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnOpen = document.getElementById('btn-open');
const btnSyslite = document.getElementById('btn-syslite');
const btnRebuild = document.getElementById('btn-rebuild');
const btnFirstSetup = document.getElementById('btn-first-setup');

function appendLog(channel, text) {
  const line = document.createElement('div');
  line.className = `log-line ${channel}`;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus(status) {
  backendDot.classList.toggle('on', status.backend);
  frontendDot.classList.toggle('on', status.frontend);
  btnStart.disabled = status.backend || status.frontend;
  btnStop.disabled = !status.backend && !status.frontend;
}

window.api.onLog(({ channel, text }) => appendLog(channel, text));
window.api.onStatus((status) => updateStatus(status));

btnStart.addEventListener('click', () => window.api.startDashboard());
btnStop.addEventListener('click', () => window.api.stopDashboard());
btnOpen.addEventListener('click', () => window.api.openDashboard());
btnSyslite.addEventListener('click', () => window.api.openSyslite());
btnRebuild.addEventListener('click', () => window.api.rebuildFrontend());
btnFirstSetup.addEventListener('click', async () => {
  btnFirstSetup.disabled = true;
  btnFirstSetup.textContent = 'INSTALLING...';
  await window.api.firstTimeSetup();
  btnFirstSetup.textContent = 'DONE';
  setTimeout(() => { setupBanner.classList.remove('show'); }, 2000);
});

// Initial state
(async () => {
  const status = await window.api.getStatus();
  updateStatus(status);

  const firstRun = await window.api.checkFirstRun();
  if (firstRun.needsInstall) {
    setupBanner.classList.add('show');
  }
})();
