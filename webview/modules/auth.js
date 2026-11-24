// --- auth.js ---
// Authentication and onboarding logic
function checkFirstLaunch() {
  try {
    const onboarded = localStorage.getItem('foodtrack_onboarded');
    if (!onboarded) {
      if (state.drive && state.drive.connected) {
        localStorage.setItem('foodtrack_onboarded', 'true');
        return;
      }
      openAuthScreen();
    }
  } catch {}
}

function openAuthScreen() {
  document.getElementById('auth-screen')?.classList.remove('hidden');
}

function handleSkipLogin() {
  try {
    localStorage.setItem('foodtrack_onboarded', 'true');
  } catch {}
  document.getElementById('auth-screen')?.classList.add('hidden');
}

async function handleGoogleSignIn() {
  try {
    localStorage.setItem('foodtrack_onboarded', 'true');
    document.getElementById('auth-screen')?.classList.add('hidden');
    await connectGoogleDrive(true);
  } catch (error) {
    reportError(error);
  }
}
