const { systemPreferences } = require('electron');

function checkAccessibility() {
  return systemPreferences.isTrustedAccessibilityClient(false);
}

function requestAccessibility() {
  return systemPreferences.isTrustedAccessibilityClient(true);
}

function checkMicrophone() {
  const status = systemPreferences.getMediaAccessStatus('microphone');
  return status === 'granted';
}

async function requestMicrophone() {
  return systemPreferences.askForMediaAccess('microphone');
}

async function checkAll() {
  return {
    accessibility: checkAccessibility(),
    microphone: checkMicrophone(),
  };
}

module.exports = {
  checkAccessibility,
  requestAccessibility,
  checkMicrophone,
  requestMicrophone,
  checkAll,
};
