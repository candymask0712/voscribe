/**
 * Manual Jest mock for the 'electron' module.
 * Only the parts used by the modules under test are needed.
 */
const os = require('os');
const path = require('path');

const app = {
  getPath: jest.fn((name) => {
    // Return a real temp directory so fs operations don't blow up unless
    // we want them to. Individual tests override this via mockReturnValue.
    return path.join(os.tmpdir(), 'voscribe-test', name);
  }),
};

module.exports = { app };
