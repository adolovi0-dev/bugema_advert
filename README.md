# Bugema University Advert Platform

A web app where students and staff can post **lost items**, **found items**, **adverts** and **jobs**, with pictures.

- Front end: HTML, CSS, vanilla JavaScript
- Back end: Node.js + Express
- Database: MongoDB (via Mongoose); pictures are stored in MongoDB too

## Features (CRUD)
- **Create** a post (with optional picture) and choose a secret PIN
- **Read** all posts, filter by Lost / Found / Adverts / Jobs, and search
- **Update** a post (PIN required)
- **Delete** a post (PIN required)

## Run locally
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and put your MongoDB connection string in `MONGODB_URI`
3. Start: `npm start`
4. Open http://localhost:3000

## API
| Method | Route | Purpose |
|---|---|---|
| POST | /api/posts | create (multipart form, field `image` optional) |
| GET | /api/posts?category=&q= | list / search |
| GET | /api/posts/:id | one post |
| GET | /api/posts/:id/image | the picture |
| PUT | /api/posts/:id | update (needs `pin`) |
| DELETE | /api/posts/:id | delete (needs `pin`) |
