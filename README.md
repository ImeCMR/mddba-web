# MDDB America Website

Welcome to the MDDB America website repository! This is the official website for the Metadata Database (MDDB) America project, hosted on GitHub Pages and available at [mddba.com](https://mddba.com).

## About MDDB America

The Metadata Database (MDDB) America is a comprehensive research platform designed to provide researchers, institutions, and data scientists with access to standardized metadata across diverse domains. Our mission is to advance data interoperability and facilitate collaborative research through transparent, FAIR-compliant data management.

## Website Features

- **Home Page**: Overview of MDDB America and key initiatives
- **Partners Page**: Information about partnering institutions
- **News Page**: Latest updates and announcements
- **Events Page**: Upcoming conferences, workshops, and seminars
- **Publications Page**: Research papers and technical documentation
- **Community Page**: Resources and engagement opportunities

## Project Structure

```
mddba-web/
├── README.md                 # This file
├── LICENSE                   # Project license
├── CONTRIBUTING.md          # Contribution guidelines
├── .gitignore               # Git ignore rules
│
├── index.html               # Home page
│
├── assets/
│   ├── css/
│   │   ├── main.css         # Main styles
│   │   ├── responsive.css   # Responsive breakpoints
│   │   └── variables.css    # Color and theme variables
│   │
│   ├── js/
│   │   ├── common.js        # Shared JavaScript functionality
│   │   ├── main.js          # Page-specific logic
│   │   └── data.js          # Data management and APIs
│   │
│   ├── images/
│   │   ├── logos/           # Logo files
│   │   ├── partners/        # Partner logos
│   │   └── icons/           # Icon assets
│   │
│   └── videos/              # Video files
│
├── pages/
│   ├── partners.html        # Partners page
│   ├── news.html            # News page
│   ├── events.html          # Events page
│   ├── publications.html    # Publications page
│   └── community.html       # Community page
│
└── docs/
    └── deployment.md        # Deployment guide
```

## Getting Started

### Local Development

To view the website locally:

```bash
# Using Python 3
python -m http.server 8000

# Using Python 2
python -m SimpleHTTPServer 8000

# Using Node.js
npx http-server
```

Then visit: `http://localhost:8000`

### Prerequisites

- Git
- A modern web browser
- (Optional) Python or Node.js for local server

## Technologies Used

- **HTML5**: Semantic markup for accessibility
- **CSS3**: Responsive design with modern CSS features
- **JavaScript**: Progressive enhancement and interactivity
- **GitHub Pages**: Static site hosting

## Responsive Design

The website is fully responsive and optimized for:
- Mobile devices (480px and below)
- Tablets (768px to 1024px)
- Desktop screens (1024px and above)

## Key Features

- ✓ Smooth scroll animations
- ✓ Mobile-first responsive design
- ✓ FAIR data compliance
- ✓ Accessible navigation
- ✓ Video integration
- ✓ Partner showcase
- ✓ News and events management

## Deployment

The website is automatically deployed to GitHub Pages whenever changes are pushed to the `main` branch.

For detailed deployment instructions, including custom domain setup, see [docs/deployment.md](docs/deployment.md).

### Quick Deploy

```bash
git add .
git commit -m "Update: description of changes"
git push origin main
```

Your changes will be live within a few minutes!

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact & Support

- **Email**: contact@mddba.org (placeholder)
- **GitHub Issues**: [Report bugs or suggest features](https://github.com/MDDB-America/mddba-web/issues)
- **Documentation**: [Deployment Guide](docs/deployment.md)

## Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [FAIR Data Principles](https://www.go-fair.org/fair-principles/)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/)

## Acknowledgments

Built with care for the research community. Thanks to all our partners, contributors, and supporters.

---

**Last Updated:** 2026-05-08  
**Version:** 1.0  
**Website:** https://mddba.com
