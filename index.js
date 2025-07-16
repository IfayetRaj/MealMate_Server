//setup a node js file
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173", // or your frontend domain
    credentials: true,
  })
);
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
    const upcomingMealsCollection = client.db("mealmate").collection("upcomingmeals");
    const reviewCollection = client.db("mealmate").collection("mealsreview");

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

      if (meal.ingredients && typeof meal.ingredients === "string") {
        meal.ingredients = meal.ingredients
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }

      const result = await mealsCollection.insertOne(meal);
      res.send({
        success: true,
        insertedId: result.insertedId,
      });
    });

    app.get("/meals", async (req, res) => {
      const meals = await mealsCollection.find({}).toArray();
      res.send(meals);
    });

    // GET ONE meal by ID
    app.get("/meals", async (req, res) => {
      const { search, category, minPrice, maxPrice } = req.query;

      const query = {};

      if (search) {
        query.title = { $regex: search, $options: "i" }; // partial, case-insensitive
      }

      if (category && category !== "All") {
        query.category = category.toLowerCase(); // force match lowercase
      }

      if (minPrice) {
        query.price = { ...query.price, $gte: Number(minPrice) };
      }

      if (maxPrice) {
        query.price = { ...query.price, $lte: Number(maxPrice) };
      }

      const meals = await mealsCollection
        .find(query)
        .sort({ date: -1 }) // newest first
        .toArray();

      res.send(meals);
    });


    // POST an upcoming meal
    app.post("/upcoming-meals", async (req, res) => {
      const mealData = req.body;

      if (!mealData.title || !mealData.category || !mealData.price) {
        return res
          .status(400)
          .json({ success: false, message: "Missing required fields." });
      }

      try {
        const result = await upcomingMealsCollection.insertOne(mealData);
        res.json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to add upcoming meal." });
      }
    });


    // GET all upcoming meals
    app.get("/upcoming-meals", async (req, res) => {
        try {
            const upcomingMeals = await upcomingMealsCollection
            .find({})
            .sort({ date: -1 }) // Sort by date, newest first
            .toArray();
            res.send(upcomingMeals);
        } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to fetch upcoming meals." });
        }
    })

    // get upcoming all meals

    // app.get("/upcoming-meals/all", async (req, res) => {
    //     try {
    //         const upcomingMeals = await upcomingMealsCollection // Sort by date, newest first
    //         .toArray();
    //         res.send(upcomingMeals);
    //     } catch (err) {
    //         console.error(err);
    //         res.status(500).send({ error: "Failed to fetch upcoming meals." });
    //     }
    // })


    // review posting
    app.post("/reviews", async (req, res) => {
        const { mealId, userId, displayName, email, image, text } = req.body;
      
        if (!mealId || !text) {
          return res.status(400).json({ error: "mealId and text are required" });
        }
      
        try {
          const review = {
            mealId: new ObjectId(mealId),
            userId: userId ? new ObjectId(userId) : null,
            displayName,
            email,
            image,
            text,
            date: new Date(),
          };
      
          await reviewCollection.insertOne(review);
      
          // Increment reviews in mealsCollection first
          const query = { _id: new ObjectId(mealId) };
          let result = await mealsCollection.updateOne(query, { $inc: { reviews: 1 } });
      
          if (result.modifiedCount === 0) {
            // If not found, try upcomingMealsCollection
            await upcomingMealsCollection.updateOne(query, { $inc: { reviews: 1 } });
          }
      
          res.send({ success: true });
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "Failed to add review" });
        }
      });
      ``











    //   mealss by category
    // Get meals by category, limit 6
    app.get("/meals-by-category", async (req, res) => {
      const { category } = req.query;

      const query = {};
      if (category && category !== "All") {
        query.category = category.toLowerCase(); // Match lowercase
      }

      try {
        const meals = await mealsCollection
          .find(query)
          .sort({ date: -1 }) // recent first
          .limit(6)
          .toArray();

        res.send(meals);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch meals by category." });
      }
    });

    // meal delete
    app.delete("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.deleteOne(query);
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Meal not found" });
      }
      res.send({ success: true });
    });

    // meal details
    const { ObjectId } = require("mongodb");

app.get("/meals/:id", async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format" });
  }

  try {
    const query = { _id: new ObjectId(id) };

    // First, search in mealsCollection
    let meal = await mealsCollection.findOne(query);

    if (!meal) {
      // If not found, search in upcomingMealsCollection
      meal = await upcomingMealsCollection.findOne(query);
    }

    if (!meal) {
      return res.status(404).json({ error: "Meal not found" });
    }

    res.send(meal);
  } catch (err) {
    console.error("Error fetching meal:", err);
    res.status(500).json({ error: "Server error fetching meal" });
  }
});




    // Get recent 5 users
    app.get("/users/recent", async (req, res) => {
      const users = await usersCollection
        .find({})
        .sort({ _id: -1 })
        .limit(5)
        .toArray();
      res.send(users);
    });

    // Search user by email
    app.get("/users/search", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      const user = await usersCollection.findOne({ email: email });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.send([user]); // send as array for consistency
    });

    // Update user role
    app.patch("/users/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      if (!["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: role } }
      );

      if (result.modifiedCount === 0) {
        return res
          .status(404)
          .json({ error: "User not found or role unchanged" });
      }

      res.send({ success: true });
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
