const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Data = require('./models/data');
const User = require('./models/user');
const GoogleSignin = require('./models/googleSignin');
const bodyParser = require('body-parser');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcrypt');
const CLIENT_ID = process.env.GOOGLE_AUTH_TOKEN;
const client = new OAuth2Client(CLIENT_ID);
 
const app = express();

app.use(cors());

app.use(bodyParser.json()); // Parse JSON bodies
app.use(bodyParser.urlencoded({ extended: true }));

// connection to mongodb
mongoose.connect('mongodb://localhost:27017/NewsGeo').then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Error connecting to MongoDB', err);
});

async function getUserInfo(accessToken) {
    try {
        const response = await axios.get(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
        return response.data;
    } catch (error) {
        throw new Error('Error fetching user info from Google API');
    }
}

app.post('/data/:uniqueCode', async (req, res) => {
    // Extracting unique code and form data
    const uniqueID = req.params.uniqueCode;
    const formData = req.body;

    // Variable declarations
    let lat, lon, mapUrl;

    try {
        // Convert location to latitude and longitude
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${formData.location}`);
        const data = await response.data
        if (data.length > 0) {
            lat = data[0].lat;
            lon = data[0].lon;
            mapUrl = `https://www.google.com/maps?q=${lat},${lon}`;
        } else {
            console.log("No results found");
        }
    } catch (error) {
        console.error("Error fetching location data:", error);
        return res.status(500).json({ error: error.message });
    }

    // Storing into database
    try {
        const newData = await Data.create({
            uniqueCode: uniqueID,
            metaData: {
                newsUrl: formData.newsUrl,
                mapUrl: mapUrl,
                latitude: lat,
                longitude: lon,
                locationName: formData.location,
                category: formData.category,
                newsTag: `http://localhost:3000/data/${uniqueID}`,
                date: formData.date,
            }
        });

        res.json(newData)
    } catch (err) {
        console.error('Error storing data in MongoDB', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/signin', (req, res) => {
    const { email, password } = req.body;
    User.findOne({ email })
        .then(user => {
            if (user) {
                if (bcrypt.compareSync(password, user.password)) {
                    res.json('Success');
                } else {
                    res.status(401).json('Password Incorrect');
                }
            } else {
                res.status(404).json('User not registered');
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).json('Internal Server Error');
        });
});

app.post('/google-signin', async (req, res) => {
    const token = req.body.token;
    try {
        const userData = await getUserInfo(token);
        const email = userData.email;
        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({email,password:''})
        }

        let Googleuser = await GoogleSignin.findOne({ email });
        if (!Googleuser) {
            Googleuser = new GoogleSignin({ email });
            await Googleuser.save();
        }
        
        res.status(200).json('Google sign-in successful');
    } catch (error) {
        console.error('Error verifying Google token:', error);
        res.status(400).json('Invalid Token');
    }
});


app.post('/signup', (req, res) => {
    const { email, password } = req.body;
    User.findOne({ email })
        .then(user => {
            if (user) {
                return res.status(400).json({ error: 'Email already exists' });
            } else {
                const hashedPassword = bcrypt.hashSync(password, 10);
                return User.create({ email, password: hashedPassword });
            }
        })
        .then(signup => {
            res.json('User created successfully');
        })
        .catch(err => {
            console.error(err);
            res.status(500).json({ error: 'Internal Server Error' });
        });
});


app.get('/data/:uniqueCode', async (req, res) => {
    const uniqueCode = req.params.uniqueCode;

    try {
        const data = await Data.findOne({ uniqueCode });
        if (!data) {
            return res.status(404).send('Data not found');
        }
        res.json(data.metaData);
    } catch (err) {
        console.error('Error retrieving data from MongoDB', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/data', async (req, res) => {
    try {
        const category = req.query.category;
        let startDate = req.query.startDate; // Get start date from query parameters
        let endDate = req.query.endDate; // Get end date from query parameters
        let data;

        // Parse start and end dates into Date objects if provided
        if(startDate && endDate){
            startDate = new Date(startDate); // Default to start of Unix epoch if not provided
            endDate = new Date(endDate); // Default to current date if not provided
        }

        // Construct query based on category and date range
        const query = category && category !== "all" ? { 'metaData.category': category } : {};
        if(startDate && endDate){
            query['metaData.date'] = { $gte: startDate, $lte: endDate };
        }

        // Fetch data from the database
        data = await Data.find(query).sort({ _id: -1 });
        
        // Handle empty or not found data
        if (!data || data.length === 0) {
            return res.status(404).send('No data found');
        }

        // Send the data as JSON response
        res.json(data);
    } catch (err) {
        console.error('Error retrieving data from MongoDB', err);
        res.status(500).send('Internal Server Error');
    }
});
