// The build date: events from today on are listed as "Upcoming".
module.exports = () => ({ today: new Date().toISOString().slice(0, 10) });
