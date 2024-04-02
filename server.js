const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const csv = require('csv-parser');
const csvWriter = require('csv-write-stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const JWT_SECRET = 'your-secret-key';
app.use(cors());

const users = [
    { username: 'admin', password: 'admin', userType: 'admin' },
    { username: 'regular', password: 'regular', userType: 'regular' }
];

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ username, userType: user.userType }, JWT_SECRET);
    res.status(200).json({ message: 'Successfully logged in', token: token })
    // res.status(200).json({ token });
});

app.get('/home', authenticateToken, (req, res) => {
    try {
        const { userType } = req.user;
        let books = [];
        if (userType === 'admin') {
            // Admin user can read both adminUser.csv and regularUser.csv
            fs.createReadStream('adminUser.csv')
                .pipe(csv())
                .on('data', (row) => {
                    books.push(row);
                })
                .on('end', () => {
                    fs.createReadStream('regularUser.csv')
                        .pipe(csv())
                        .on('data', (row) => {
                            books.push(row);
                        })
                        .on('end', () => {
                            res.status(200).json({ books });
                        });
                });
        } else {
            // Regular user can only read regularUser.csv
            fs.createReadStream('regularUser.csv')
                .pipe(csv())
                .on('data', (row) => {
                    books.push(row);
                })
                .on('end', () => {
                    res.status(200).json({ books });
                });
        }
    } catch (error) {
        console.log(error)
        res.status(500).send({ error: error })
    }
})

app.post('/addBook', authenticateToken, (req, res) => {
    try {
        if (req.user.userType !== 'admin') {
            return res.status(403).json({ error: 'Only admin users can access this endpoint' });
        }
        const { bookName, author, publicationYear } = req.body;
        if (typeof bookName !== 'string' || typeof author !== 'string' || typeof publicationYear !== 'number') {
            return res.status(400).json({ error: 'Invalid request parameters' });
        }

        // Add book to adminUser.csv
        const writer = csvWriter({ sendHeaders: !fs.existsSync('regularUser.csv') });
        writer.pipe(fs.createWriteStream('regularUser.csv', { flags: 'a' }));
        writer.write({ bookName, author, publicationYear });
        writer.end();

        res.status(201).json({ message: 'Book added successfully' });
    } catch (error) {
        console.log(error)
        res.status(500).send({ error: error })
    }
})

app.delete('/deleteBook', authenticateToken, (req, res) => {
    try {
        if (req.user.userType !== 'admin') {
            return res.status(403).json({ error: 'Only admin users can access this endpoint' });
        }
        const { bookName } = req.query;
        if (typeof bookName !== 'string') {
            return res.status(400).json({ error: 'Invalid request parameter' });
        }

        // Read adminUser.csv and remove the specified book
        const rows = [];
        fs.createReadStream('regularUser.csv')
            .pipe(csv())
            .on('data', (row) => {
                if (row.bookName.toLowerCase() !== bookName.toLowerCase()) {
                    rows.push(row);
                }
            })
            .on('end', () => {
                // Write updated data back to adminUser.csv
                const writer = csvWriter();
                writer.pipe(fs.createWriteStream('regularUser.csv'));
                rows.forEach(row => writer.write(row));
                writer.end();
                res.json({ message: 'Book deleted successfully' });
            });
    } catch (error) {
        console.log(error)
        res.status(500).send({ error: error })
    }
})


function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token not provided' });
    }
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

app.listen(PORT, () => {
    console.log('server listening on port ' + PORT)
})