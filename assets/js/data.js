// data.js — content used by the home page counters and the nodes globe.
// Update this file when partners, publications, events or nodes change
// (the matching HTML pages are edited separately — see README.md).
window.siteData = {
  partners: [
    'University of Florida'
  ],
  publications: [
    'FAIR Principles in Biomolecular Simulations'
  ],
  events: [
    {
      title: 'Multi-scale Simulations of Protein Folding: The Importance of Data',
      description: 'Organised by the MDDB America Consortium. Open to all researchers in the field.',
      tag: 'Workshop',
      date: '2026-12-10',
      actionText: 'Register →',
      actionUrl: '#'
    },
    {
      title: 'MDDB America Inaugural Conference',
      description: 'Our inaugural conference brought together leading researchers from across the Americas.',
      tag: 'Conference',
      date: '2026-02-20',
      actionText: 'View Recap →',
      actionUrl: '#'
    }
  ],

  // MDDB nodes — shown in the "Explore MDDB Nodes" section, in this order.
  // lon/lat place the marker on the globe.
  nodes: [
    { name: 'MDDB Main Node',    place: 'Barcelona, Spain',      lon: 2.1734,   lat: 41.3851, url: 'https://mdposit.mddbr.eu' },
    { name: 'MDDB Florida Node', place: 'Gainesville, Florida',  lon: -82.3248, lat: 29.6516, url: 'https://devmddb.rc.ufl.edu' },
    // Placed at the centre of Japan until the hosting city is confirmed.
    { name: 'MDDB Japan Node',   place: 'Japan',                 lon: 138.25,   lat: 36.2,    url: 'https://japan.mddba.org' }
  ],

  // Other institutions drawn on the globe (from the v1 map). Pairs that sit a
  // few km apart are merged so their markers don't overlap.
  sites: [
    { name: 'University of Florida',                            lon: -82.3248, lat: 29.6516 },
    { name: 'Oxford University',                                lon: -1.2544,  lat: 51.7548 },
    { name: 'IRB Barcelona (MMB) & Barcelona Supercomputing Center', lon: 2.1435, lat: 41.3872 },
    { name: 'Cineca',                                           lon: 11.3426,  lat: 44.4949 },
    { name: 'Inria & RPBS',                                     lon: 2.2858,   lat: 48.8448 },
    { name: 'JSC',                                              lon: 6.3603,   lat: 50.9175 }
  ]
};
