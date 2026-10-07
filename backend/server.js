const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const frontendPath = path.join(__dirname, '..', 'frontend');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50kb' }));

// Sample Destinations Data
const destinations = [
  {
    id: "mitawali-1",
    name: "Mitawali Chausath Yogini Temple",
    category: "Heritage",
    location: "Morena, MP",
    rating: 4.9,
    price: 3499,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    description: "Architectural inspiration for the Indian Parliament building, built on a circular hill top surrounded by scenic views.",
    lat: 26.3762,
    lng: 78.2325
  },
  {
    id: "padavali-1",
    name: "Bateshwar & Padavali Temples",
    category: "Archaeology",
    location: "Morena, MP",
    rating: 4.8,
    price: 3999,
    image: "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=800&q=80",
    description: "A cluster of nearly 200 mini sandstone temples dedicated to Shiva and Vishnu dating back to the 8th-10th century.",
    lat: 26.3989,
    lng: 78.1884
  },
  {
    id: "chambal-safari-1",
    name: "National Chambal Sanctuary",
    category: "Wildlife",
    location: "Morena Border",
    rating: 4.7,
    price: 4999,
    image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80",
    description: "Home to the rare Gharial, Gangetic river dolphin, and migratory birds. Boat safaris available on the Chambal river.",
    lat: 26.6854,
    lng: 78.0706
  },
  {
    id: "goa-03",
    name: "Goa Coastal Escape",
    category: "Beach",
    location: "Canacona, Goa",
    rating: 4.8,
    price: 8999,
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
    description: "Unwind on palm-lined beaches, explore the coastline, and catch a sunset over the Arabian Sea.",
    lat: 15.2736,
    lng: 74.1237
  },
  {
    id: "manali-04",
    name: "Manali & Solang Valley",
    category: "Adventure",
    location: "Manali, Himachal Pradesh",
    rating: 4.9,
    price: 12500,
    image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
    description: "Mountain scenery, alpine trails, and seasonal adventures in the Himalayas.",
    lat: 32.2432,
    lng: 77.1892
  },
  {
    id: "gwalior-05",
    name: "Gwalior Fort & Jai Vilas Palace",
    category: "Heritage",
    location: "Gwalior, Madhya Pradesh",
    rating: 4.8,
    price: 5499,
    image: "https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=800&q=80",
    description: "Discover hilltop fortifications, historic palaces, and the layered heritage of Gwalior.",
    lat: 26.2295,
    lng: 78.1728
  }
];

// Sample Packages Data
const packages = [
  {
    id: "chambal-safari-1",
    title: "Chambal River Wildlife & Eco-Safari",
    category: "Adventure & Wildlife",
    duration: "2 Days / 1 Night",
    location: "Morena & Chambal Sanctuary",
    rating: 4.8,
    price: 3499,
    image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80",
    description: "Experience the pristine clean waters of River Chambal with boat rides, dolphin sighting, gharial watching, and eco-resort night stay.",
    highlights: ["Gharial & Gangetic Dolphin Boat Tour", "Sihoniya Jain Temple Visit", "Morena Gajak Tasting Session", "Local Heritage Guide Included"],
    lat: 26.6854,
    lng: 78.0706
  },
  {
    id: "heritage-circuit-1",
    title: "Golden Triangle of Morena Heritage",
    category: "Culture & History",
    duration: "1 Full Day",
    location: "Mitawali - Padavali - Bateshwar",
    rating: 4.9,
    price: 1999,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    description: "Discover the architectural wonders of Chausath Yogini, Bateshwar temple complex, and Padavali fort in a single curated day trip.",
    highlights: ["Private Cab Transport from Morena / Gwalior", "Archaeology Expert Guide", "Traditional Lunch Included", "Sunset Photography at Mitawali"],
    lat: 26.3762,
    lng: 78.2325
  }
];

// API Routes
function destinationRecord(destination) {
  const parts = String(destination.location || "India").split(",").map(part => part.trim());
  return {
    ...destination,
    city: parts[0] || "",
    state: parts[1] || "",
    images: destination.images || (destination.image ? [destination.image] : []),
    bestTime: destination.bestTime || null,
    estimatedBudget: Number(destination.estimatedBudget ?? destination.price ?? 0),
    attractions: Array.isArray(destination.attractions) ? destination.attractions : [],
    nearbyPlaces: Array.isArray(destination.nearbyPlaces) ? destination.nearbyPlaces : [],
    reviews: Array.isArray(destination.reviews) ? destination.reviews : []
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'TourVista API Backend is Running Live!' });
});

app.get('/api/destinations', (req, res) => {
  res.json(destinations.map(destinationRecord));
});

app.get('/api/destinations/:id', (req, res) => {
  const dest = destinations.find(d => d.id === req.params.id);
  if (!dest) return res.status(404).json({ message: "Destination not found" });
  res.json(destinationRecord(dest));
});

app.get('/api/packages', (req, res) => {
  res.json(packages);
});

app.get('/api/packages/:id', (req, res) => {
  const pkg = packages.find(p => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ message: "Package not found" });
  res.json(pkg);
});

// Location, routing & AI proxy (OpenStreetMap / OSRM / AI provider) - see geo-ai.js and .env.example
app.use('/api', require('./geo-ai'));

app.use(express.static(frontendPath));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`TourVista Server running on http://localhost:${PORT}`);
});
