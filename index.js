//setup a node js file
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

// Middleware
app.use(cors({
    origin: "http://localhost:5173", // or your frontend domain
    credentials: true,
  }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes

const uri =
  "mongodb+srv://mealmate:rRoO2FZI8fHdYI8v@cluster0.ddy6nyc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("mealmate").collection("users");
    const mealsCollection = client.db("mealmate").collection("meals");

    // root route
    app.get("/", (req, res) => {
      res.send("heyy");
    });

    // get all users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get user data by email
    app.get("/user/:email", async (req, res) => {
        const email = req.params.email;
        console.log(email);
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }
        res.send(user);
      });


    //   meal post

    app.post("/meals", async (req, res) => {
      const meal = req.body;
      const result = await mealsCollection.insertOne(meal);
      res.send({
        success: true,
        insertedId: result.insertedId,
      });
    });




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
