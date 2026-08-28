// Express 4 doesn't catch rejected promises from async route/middleware
// functions — an unhandled rejection there crashes the whole process, taking
// down the API for every user over one bad query. Wrap every async handler
// with this so errors go to Express's error middleware (a clean 500) instead.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
