// Numbers and globe data worked out from the content, for the home page
// counters and assets/js/data.js (read by home.js and globe.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const plain = (s) => String(s || '').replace(/\*\*/g, '');

module.exports = () => {
  const nodes = read('nodes.json');
  const events = read('events.json');
  const publications = read('publications.json');
  const sites = nodes.sites || [];

  // nodes per region: the sites of each main node, or the main node alone
  // while it has none listed (Japan). Each node is one partner institution.
  const regions = nodes.mainNodes.map((n) => ({
    region: n.region,
    count: Math.max(1, sites.filter((p) => p.region === n.region).length)
  }));
  const total = regions.reduce((sum, r) => sum + r.count, 0);

  const siteData = {
    publications: publications.items.map((p) => p.title),
    events: events.items.filter((e) => !e.hidden).map((e) => ({
      title: e.title, description: e.text, tag: e.type, date: e.date,
      actionText: plain(e.buttonText), actionUrl: e.link || '#'
    })),
    nodes: nodes.mainNodes.map((n) => ({
      name: n.name, region: n.region, place: n.place, lon: n.lon, lat: n.lat, url: n.url || null
    })),
    sites: sites.map((p) => ({ name: p.name, region: p.region, lon: p.lon, lat: p.lat }))
  };
  const json = JSON.stringify(siteData);

  return {
    regions,
    counts: {
      nodes: total,
      partners: total,
      publications: siteData.publications.length,
      events: siteData.events.length
    },
    siteData,
    // changes whenever the data changes, so browsers fetch the new data.js
    dataVersion: crypto.createHash('sha1').update(json).digest('hex').slice(0, 8)
  };
};
