require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const CATEGORIES = ['lost', 'found', 'advert', 'job'];
const hashPin = (pin) => crypto.createHash('sha256').update(String(pin)).digest('hex');

/* ---------- Database model ---------- */
const postSchema = new mongoose.Schema(
  {
    category: { type: String, enum: CATEGORIES, required: [true, 'Category is required'] },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 120 },
    description: { type: String, required: [true, 'Description is required'], trim: true, maxlength: 2000 },
    organization: { type: String, trim: true, maxlength: 120 }, // employer / business
    location: { type: String, trim: true, maxlength: 120 }, // where lost/found, or where the advert applies
    price: { type: String, trim: true, maxlength: 60 }, // adverts
    deadline: { type: Date }, // jobs
    contactName: { type: String, required: [true, 'Contact name is required'], trim: true, maxlength: 80 },
    contactPhone: { type: String, trim: true, maxlength: 30 },
    contactEmail: { type: String, trim: true, maxlength: 120 },
    image: { data: Buffer, contentType: String }, // picture stored inside MongoDB
    pinHash: { type: String, required: true, select: false }, // secret PIN needed to edit/delete
  },
  { timestamps: true }
);
const Post = mongoose.model('Post', postSchema);

/* ---------- App setup ---------- */
const app = express();
app.use(express.json());

const sendStatic = (file) => (req, res) => res.sendFile(path.join(__dirname, file));
app.get('/', sendStatic('index.html'));
app.get('/style.css', sendStatic('style.css'));
app.get('/app.js', sendStatic('app.js'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed')),
});

const FIELDS = ['category', 'title', 'description', 'organization', 'location', 'price', 'deadline', 'contactName', 'contactPhone', 'contactEmail'];
function pick(body) {
  const out = {};
  FIELDS.forEach((f) => {
    if (body[f] !== undefined) out[f] = String(body[f]).trim();
  });
  if (out.deadline === '') out.deadline = undefined;
  return out;
}
function toPublic(doc) {
  const o = doc.toObject();
  o.hasImage = !!(o.image && o.image.contentType);
  delete o.image;
  delete o.pinHash;
  return o;
}
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const badId = (id) => !mongoose.isValidObjectId(id);

/* ---------- CRUD routes ---------- */

// CREATE
app.post('/api/posts', upload.single('image'), async (req, res, next) => {
  try {
    const pin = String(req.body.pin || '');
    if (pin.length < 4) return res.status(400).json({ error: 'Choose a PIN of at least 4 characters (you need it to edit or delete the post).' });
    const data = pick(req.body);
    data.pinHash = hashPin(pin);
    if (req.file) data.image = { data: req.file.buffer, contentType: req.file.mimetype };
    const post = await Post.create(data);
    res.status(201).json(toPublic(post));
  } catch (e) {
    next(e);
  }
});

// READ (list, with optional category filter and search)
app.get('/api/posts', async (req, res, next) => {
  try {
    const filter = {};
    if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { location: rx }, { organization: rx }];
    }
    const posts = await Post.find(filter).select('-image.data').sort({ createdAt: -1 }).limit(200);
    res.json(posts.map(toPublic));
  } catch (e) {
    next(e);
  }
});

// READ (one)
app.get('/api/posts/:id', async (req, res, next) => {
  try {
    if (badId(req.params.id)) return res.status(404).json({ error: 'Post not found' });
    const post = await Post.findById(req.params.id).select('-image.data');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(toPublic(post));
  } catch (e) {
    next(e);
  }
});

// READ (picture)
app.get('/api/posts/:id/image', async (req, res, next) => {
  try {
    if (badId(req.params.id)) return res.sendStatus(404);
    const post = await Post.findById(req.params.id).select('image');
    if (!post || !post.image || !post.image.data) return res.sendStatus(404);
    res.set('Content-Type', post.image.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(post.image.data);
  } catch (e) {
    next(e);
  }
});

// UPDATE
app.put('/api/posts/:id', upload.single('image'), async (req, res, next) => {
  try {
    if (badId(req.params.id)) return res.status(404).json({ error: 'Post not found' });
    const post = await Post.findById(req.params.id).select('+pinHash');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.pinHash !== hashPin(req.body.pin || '')) return res.status(403).json({ error: 'Wrong PIN.' });
    Object.assign(post, pick(req.body));
    if (req.file) post.image = { data: req.file.buffer, contentType: req.file.mimetype };
    else if (req.body.removeImage === 'true') post.image = undefined;
    await post.save();
    res.json(toPublic(post));
  } catch (e) {
    next(e);
  }
});

// DELETE
app.delete('/api/posts/:id', async (req, res, next) => {
  try {
    if (badId(req.params.id)) return res.status(404).json({ error: 'Post not found' });
    const post = await Post.findById(req.params.id).select('+pinHash');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.pinHash !== hashPin((req.body && req.body.pin) || '')) return res.status(403).json({ error: 'Wrong PIN.' });
    await post.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- Errors ---------- */
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(' ') });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Picture is too big (max 2 MB).' : err.message });
  }
  if (err.message === 'Only image files are allowed') return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and put your MongoDB connection string in it.');
  process.exit(1);
}
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Bugema Advert Platform running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
