const express = require('express');
const jwt = require('jsonwebtoken'); 
const app = express();
const PORT = 5000;

app.use(express.json());

const JWT_SECRET = 'adaptNXT_secret_key';

const users = [
  { id: 1, username: 'admin', password: 'admin123', role: 'admin' },
  { id: 2, username: 'customer', password: 'cust123', role: 'customer' }
];

// Products
let products = [
  { id: 1, name: "Laptop", price: 75000 },
  { id: 2, name: "Smartphone", price: 30000 },
  { id: 3, name: "Headphones", price: 2000 },
  { id: 4, name: "Keyboard", price: 1500 },
  { id: 5, name: "Mouse", price: 800 },
  { id: 6, name: "Monitor", price: 12000 }
];

const carts = {};
const orders = [];

// --------------------- LOGIN ---------------------
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  res.json({ message: 'Login successful', token });
});

// --------------------- MIDDLEWARES ---------------------
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function isAdmin(req, res, next) {
  if (req.user.role === 'admin') next();
  else res.status(403).json({ message: 'Admin access only' });
}

// --------------------- ROOT ---------------------
app.get('/', (req, res) => {
  res.send('Welcome to AdaptNXT E-commerce API');
});

// --------------------- PRODUCTS ---------------------

// Public: Get all products (No JWT needed)
app.get('/products', (req, res) => {
  const { page = 1, limit = 5, search = '' } = req.query;

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const start = (page - 1) * limit;
  const end = page * limit;
  const paginated = filtered.slice(start, end);

  res.json({
    page: Number(page),
    limit: Number(limit),
    totalProducts: filtered.length,
    products: paginated
  });
});

// Admin only: Add a product
app.post('/products', authenticate, isAdmin, (req, res) => {
  const { name, price } = req.body;
  if (!name || !price) {
    return res.status(400).json({ message: 'Name and price are required' });
  }
  const newProduct = { id: products.length + 1, name, price };
  products.push(newProduct);
  res.status(201).json({ message: 'Product added', product: newProduct });
});

// Admin only: Update a product
app.put('/products/:id', authenticate, isAdmin, (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;
  const product = products.find(p => p.id == id);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }
  if (name) product.name = name;
  if (price) product.price = price;
  res.json({ message: 'Product updated', product });
});

// Admin only: Delete a product
app.delete('/products/:id', authenticate, isAdmin, (req, res) => {
  const { id } = req.params;
  const index = products.findIndex(p => p.id == id);
  if (index === -1) {
    return res.status(404).json({ message: 'Product not found' });
  }
  products.splice(index, 1);
  res.json({ message: 'Product deleted' });
});

// --------------------- CART ---------------------
app.get('/cart', authenticate, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Customer access only' });
  const userId = req.user.userId;
  const cart = carts[userId] || [];
  res.json(cart);
});

app.post('/cart', authenticate, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Customer access only' });
  const userId = req.user.userId;
  const { productId, quantity } = req.body;

  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  if (!carts[userId]) carts[userId] = [];
  const cartItem = carts[userId].find(item => item.productId === productId);
  if (cartItem) {
    cartItem.quantity += quantity;
  } else {
    carts[userId].push({ productId, quantity });
  }
  res.status(201).json({ message: 'Item added to cart', cart: carts[userId] });
});

app.put('/cart', authenticate, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Customer access only' });
  const userId = req.user.userId;
  const { productId, quantity } = req.body;

  const cart = carts[userId];
  if (!cart) return res.status(404).json({ message: 'Cart not found' });

  const cartItem = cart.find(item => item.productId === productId);
  if (!cartItem) return res.status(404).json({ message: 'Product not in cart' });

  cartItem.quantity = quantity;
  res.json({ message: 'Cart updated', cart });
});

app.delete('/cart/:productId', authenticate, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Customer access only' });
  const userId = req.user.userId;
  const productId = parseInt(req.params.productId);

  const cart = carts[userId];
  if (!cart) return res.status(404).json({ message: 'Cart not found' });

  carts[userId] = cart.filter(item => item.productId !== productId);
  res.json({ message: 'Item removed', cart: carts[userId] });
});

// --------------------- ORDERS ---------------------
app.post('/orders', authenticate, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Customer access only' });
  const userId = req.user.userId;
  const cart = carts[userId];
  if (!cart || cart.length === 0) return res.status(400).json({ message: 'Cart is empty' });

  const total = cart.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (product.price * item.quantity);
  }, 0);

  const newOrder = {
    orderId: orders.length + 1,
    userId,
    items: cart,
    total,
    date: new Date().toISOString()
  };

  orders.push(newOrder);
  carts[userId] = [];
  res.status(201).json({ message: 'Order placed successfully', order: newOrder });
});

app.get('/orders', authenticate, (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ message: 'Customer access only' });
  const userId = req.user.userId;
  const userOrders = orders.filter(o => o.userId === userId);
  res.json(userOrders);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
