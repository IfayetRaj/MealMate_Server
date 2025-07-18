const express = require("express");
// const cookieParser = require("cookie-parser");
// const bcrypt = require("bcrypt");
// import bcrypt from "bcryptjs";
const jwt = require("jsonwebtoken");
// import admin from "firebase-admin";
// const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const Stripe = require("stripe");
const stripe = new Stripe(process.env.PAYMENT_GETWAY_KEY);

// Middleware
const cors = require("cors");
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// uri
const uri =
  `mongodb+srv://${process.env.MONGODB}0.ddy6nyc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const usersCollection = client.db("mealmate").collection("users");
    const mealsCollection = client.db("mealmate").collection("meals");
    const upcomingMealsCollection = client
      .db("mealmate")
      .collection("upcomingmeals");
    const reviewCollection = client.db("mealmate").collection("mealsreview");
    const requestsCollection = client.db("mealmate").collection("requests");

    // root route
    app.get("/", (req, res) => {
      res.send("heyy");
    });

    // post users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existing = await usersCollection.findOne({ email: user.email });
      if (existing) {
        return res.json({ success: false, message: "User already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // get user data by email (search)
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

    // meal post
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

    // getting all meal data
    app.get("/meals", async (req, res) => {
      const {
        search,
        category,
        sortBy = "date",
        sortOrder = "desc",
      } = req.query;

      const query = {};

      if (search) {
        query.title = { $regex: search, $options: "i" }; // partial case-insensitive match
      }

      if (category && category !== "All") {
        query.category = category.toLowerCase(); // filter by category
      }

      let sortOptions = {};
      if (sortBy === "price") {
        sortOptions.price = sortOrder === "asc" ? 1 : -1;
      } else if (sortBy === "category") {
        sortOptions.category = sortOrder === "asc" ? 1 : -1;
      } else {
        sortOptions.date = sortOrder === "asc" ? 1 : -1; // default to date
      }

      const meals = await mealsCollection
        .find(query)
        .sort(sortOptions)
        .toArray();
      res.send(meals);
    });

    // ✅ Dedicated category route with limit
    app.get("/meals-by-category", async (req, res) => {
      const { category, limit = 6 } = req.query;
      if (!category)
        return res.status(400).json({ error: "Category required" });

      const query = { category: { $regex: new RegExp(`^${category}$`, "i") } };
      const meals = await mealsCollection
        .find(query)
        .sort({ date: -1 })
        .limit(parseInt(limit))
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

      if (mealData.ingredients && typeof mealData.ingredients === "string") {
        mealData.ingredients = mealData.ingredients
          .split(",")
          .map((item) => item.trim()) // remove extra spaces
          .filter((item) => item.length > 0); // remove empty strings if any
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

    // publishsing upcoming meals
    app.post("/upcoming-meals/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid meal ID" });
      }

      try {
        const meal = await upcomingMealsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!meal) {
          return res.status(404).json({ error: "Upcoming meal not found" });
        }

        const updatedMeal = {
          ...meal,
          status: "ongoing",
        };

        // Optional: remove the _id
        delete updatedMeal._id;

        // 3️⃣ Insert into mealsCollection
        const result = await mealsCollection.insertOne(updatedMeal);

        // 4️⃣ Remove from upcomingMealsCollection
        await upcomingMealsCollection.deleteOne({ _id: new ObjectId(id) });

        res.json({
          success: true,
          insertedId: result.insertedId,
          message: "Meal published successfully.",
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to publish upcoming meal" });
      }
    });

    // updating meals
    app.put("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const updatedMeal = req.body;

      if (
        updatedMeal.ingredients &&
        typeof updatedMeal.ingredients === "string"
      ) {
        updatedMeal.ingredients = updatedMeal.ingredients
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }

      try {
        const result = await mealsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedMeal }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Meal not found or not updated.",
          });
        }

        res.json({ success: true, message: "Meal updated successfully." });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .json({ success: false, message: "Failed to update meal." });
      }
    });

    // GET all upcoming meals
    app.get("/upcoming-meals", async (req, res) => {
      try {
        const upcomingMeals = await upcomingMealsCollection
          .find({})
          .sort({ date: -1 })
          .toArray();
        res.send(upcomingMeals);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch upcoming meals." });
      }
    });

    // review posting
    app.post("/reviews", async (req, res) => {
      const {
        mealId,
        userId,
        displayName,
        email,
        image,
        text,
        reviews,
        likes,
        title,
      } = req.body;

      if (!mealId || !text) {
        return res.status(400).json({ error: "mealId and text are required" });
      }

      try {
        const review = {
          mealId: new ObjectId(mealId),
          userId: userId ? new ObjectId(userId) : null,
          displayName,
          email,
          reviews,
          likes,
          title,
          image,
          text,
          date: new Date(),
        };

        await reviewCollection.insertOne(review);

        // Increment reviews in mealsCollection first
        const query = { _id: new ObjectId(mealId) };
        let result = await mealsCollection.updateOne(query, {
          $inc: { reviews: 1 },
        });

        if (result.modifiedCount === 0) {
          // If not found, try upcomingMealsCollection
          await upcomingMealsCollection.updateOne(query, {
            $inc: { reviews: 1 },
          });
        }

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to add review" });
      }
    });
    // get all data from reviews
    app.get("/reviews", async (req, res) => {
      try {
        const reviews = await reviewCollection.find().toArray();
        res.send(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Failed to fetch reviews." });
      }
    });

    // getting requests based on user email
    app.get("/requests/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { userEmail: email };
        const requests = await requestsCollection.find(query).toArray();
        res.send(requests);
      } catch (err) {
        console.error("Error in /requests/:email:", err);
        res.status(500).send({ error: "Failed to fetch requests." });
      }
    });

    // getting reviews by user email
    app.get("/reviews/user/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const reviews = await reviewCollection
          .find({ email: email })
          // .sort({ date: -1 })
          .toArray();

        res.send(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch user reviews" });
      }
    });

    // delete review by user email
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid review ID" });
      }

      try {
        const result = await reviewCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Review not found" });
        }

        res.send({ success: true, message: "Review deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete review" });
      }
    });

    // get review by review id
    app.get("/reviews/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid review ID" });
      }

      try {
        const review = await reviewCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!review) {
          return res.status(404).json({ error: "Review not found" });
        }

        res.send(review);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch review" });
      }
    });

    // updating comment
    app.patch("/reviews/:id", async (req, res) => {
      const reviewId = req.params.id;
      const { text } = req.body;

      try {
        const result = await reviewCollection.updateOne(
          { _id: new ObjectId(reviewId) },
          { $set: { text: text } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ error: "Review not found or not updated." });
        }

        res.json({ success: true, updatedCount: result.modifiedCount });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update review." });
      }
    });

    // deleting request
    app.delete("/requests/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid request ID" });
      }

      try {
        const result = await requestsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: "Request not found" });
        }

        res.send({ success: true, message: "Request deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete request" });
      }
    });

    //   get reviews by meal ID
    app.get("/reviews/:mealId", async (req, res) => {
      const mealId = req.params.mealId;

      try {
        const reviews = await reviewCollection
          .find({ mealId: new ObjectId(mealId) })
          .sort({ date: -1 })
          .toArray();

        res.send(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch reviews" });
      }
    });

    // likes by meal id
    app.patch("/meals/:id/like", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const { action } = req.body;
      if (!["like", "dislike"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const inc = action === "like" ? 1 : -1;
      const query = { _id: new ObjectId(id) };

      let released = false;

      try {
        // Try update in meals collection first
        const result = await mealsCollection.updateOne(query, {
          $inc: { likes: inc },
        });

        if (result.matchedCount === 0) {
          // Not found in meals, try upcoming meals
          const updateResult = await upcomingMealsCollection.findOneAndUpdate(
            query,
            { $inc: { likes: inc } },
            { returnDocument: "after" }
          );
          console.log(updateResult);
          if (!updateResult) {
            return res
              .status(404)
              .json({ error: "Meal not found in either collection" });
          }

          const updatedMeal = updateResult;

          // Check if likes hit threshold and status not yet ongoing
          if (updatedMeal.likes >= 10 && updatedMeal.status !== "ongoing") {
            // Update status in upcoming collection
            await upcomingMealsCollection.updateOne(query, {
              $set: { status: "ongoing" },
            });

            // Fetch updated doc again (or reuse updatedMeal and just patch status)
            const ongoingMeal = await upcomingMealsCollection.findOne(query);

            if (ongoingMeal) {
              const { _id, ...mealData } = ongoingMeal; // remove _id to avoid duplicate key error

              // Insert into main meals collection
              await mealsCollection.insertOne(mealData);

              // Remove from upcoming meals collection
              await upcomingMealsCollection.deleteOne(query);

              released = true; // mark that meal was published
            }
          }
        }

        return res.json({ success: true, action, released });
      } catch (error) {
        console.error("Error in PATCH /meals/:id/like:", error);
        return res.status(500).json({ error: "Failed to toggle like" });
      }
    });


    // Get meals by category with limit
    app.get("/meals-by-category", async (req, res) => {
      const { category } = req.query;

      let query = {};

      if (category && category !== "All") {
        // Case-insensitive match using regex
        query.category = { $regex: new RegExp(`^${category}$`, "i") };
      }

      try {
        const meals = await mealsCollection
          .find(query)
          .sort({ date: -1 }) // Sort by date descending
          .limit(3) // ✅ Only 3 meals
          .toArray();

        res.send(meals);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch meals by category." });
      }
    });

    // Search meal by title
    app.get("/meals/search", async (req, res) => {
      const { title } = req.query;

      if (!title) {
        return res.status(400).json({ error: "Title query is required" });
      }

      try {
        const meal = await mealsCollection.findOne({
          title: { $regex: new RegExp(`^${title}$`, "i") },
        });

        if (!meal) {
          return res.status(404).json({ error: "Meal not found" });
        }

        res.send(meal);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to search meal" });
      }
    });
    // meal delete
    app.delete("/meals/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid meal ID" });
      }

      const mealQuery = { _id: new ObjectId(id) };

      try {
        // Delete the meal
        const mealResult = await mealsCollection.deleteOne(mealQuery);

        if (mealResult.deletedCount === 0) {
          return res.status(404).json({ error: "Meal not found" });
        }

        // Delete related reviews
        const reviewQuery = { mealId: new ObjectId(id) }; // Assuming your reviews store mealId as a string
        const reviewsResult = await reviewCollection.deleteMany(reviewQuery);

        res.send({
          success: true,
          message: `Meal deleted successfully. Also deleted ${reviewsResult.deletedCount} related reviews.`,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete meal and reviews" });
      }
    });

    // meal details page
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

    // Create request--------------------kaj sesh
    app.post("/request-meal", async (req, res) => {
      console.log("Request received:", req.body);
      const {
        userName,
        userEmail,
        mealId,
        mealTitle,
        mealLikes,
        mealPrice,
        status,
      } = req.body;

      if (!userEmail || !mealId) {
        return res
          .status(400)
          .send({ success: false, error: "Missing userEmail or mealId" });
      }

      try {
        const query = { userEmail: userEmail, mealId: mealId };
        const existingRequest = await requestsCollection.findOne(query);

        if (existingRequest) {
          return res.send({ success: false, message: "Already requested." });
        }

        // Not found → insert new request
        const newRequest = {
          userName,
          userEmail,
          mealId,
          mealTitle,
          mealLikes,
          mealPrice,
          status: status || "pending",
          requestedAt: new Date(),
        };

        await requestsCollection.insertOne(newRequest);

        return res.send({ success: true, message: "Request created." });
      } catch (error) {
        console.error(error);
        return res.status(500).send({ success: false, error: "Server error" });
      }
    });

    // get all requests
    app.get("/requested-meals", async (req, res) => {
      try {
        const allRequests = await requestsCollection
          .aggregate([
            {
              $addFields: {
                statusOrder: {
                  $switch: {
                    branches: [
                      {
                        case: { $eq: [{ $toLower: "$status" }, "pending"] },
                        then: 1,
                      },
                      {
                        case: { $eq: [{ $toLower: "$status" }, "served"] },
                        then: 2,
                      },
                    ],
                    default: 3,
                  },
                },
              },
            },
            { $sort: { statusOrder: 1, requestedAt: -1 } },
            { $project: { statusOrder: 0 } },
          ])
          .toArray();

        console.log("Sorted requests:", allRequests);
        res.send(allRequests);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch requested meals" });
      }
    });

    // meals like
    app.patch("/meals/:id/like", async (req, res) => {
      const id = req.params.id;
      const { action } = req.body; // action: "like" or "dislike"

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      if (!["like", "dislike"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const query = { _id: new ObjectId(id) };
      const inc = action === "like" ? 1 : -1;

      try {
        let result = await mealsCollection.updateOne(query, {
          $inc: { likes: inc },
        });

        if (result.modifiedCount === 0) {
          await upcomingMealsCollection.updateOne(query, {
            $inc: { likes: inc },
          });
        }

        res.send({ success: true, action });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to toggle like" });
      }
    });

    // handeling meal requests status
    app.patch("/requested-meals/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      // Allow "Served" now
      if (!["approved", "rejected", "Served"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      try {
        const result = await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({ error: "Request not found or status unchanged" });
        }

        res.send({ success: true, status: status });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update request status" });
      }
    });

    // Get recent  users
    app.get("/users/recent/:email", async (req, res) => {
      const currentEmail = req.params.email;

      try {
        const users = await usersCollection
          .find({ email: { $ne: currentEmail } }) // $ne => not equal
          .toArray();

        res.send(users);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch users" });
      }
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

    // Create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount, planName, userEmail } = req.body;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });
    const paymentCollection = client
      .db("mealmate")
      .collection("paymentHistory");
    // Confirm payment & update badge (optional but secure)
    app.post("/confirm-payment", async (req, res) => {
      try {
        const { userEmail, planName, amount, transactionId } = req.body;

        const result = await usersCollection.updateOne(
          { email: userEmail },
          { $set: { badge: planName } }
        );

        const paymentHistory = {
          userEmail,
          planName,
          amount,
          transactionId,
          status: "complete",
          date: new Date(),
        };

        const paymentResult = await paymentCollection.insertOne(paymentHistory);

        res.send({
          success: true,
          badgeUpdate: result,
          paymentRecord: paymentResult,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    //   payment history by email
    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const history = await paymentCollection
          .find({ userEmail: email })
          .toArray();

        if (history.length === 0) {
          return res
            .status(404)
            .json({ error: "No payment history found for this user" });
        }

        res.send(history);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch payment history" });
      }
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
