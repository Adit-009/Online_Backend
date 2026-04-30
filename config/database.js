const mongoose = require('mongoose');

const connectDB = async () => {
  const remoteUri = process.env.MONGO_URI;
  const localUri = process.env.MONGO_URI_LOCAL || 'mongodb://127.0.0.1:27017/online-course';

  try {
    console.log('🔄 Connecting to MongoDB (Remote)...');
    const conn = await mongoose.connect(remoteUri, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
    });
    console.log(`✅ Connected to Remote MongoDB: ${conn.connection.host}`);
    
    // Global error listener for errors after initial connection
    mongoose.connection.on('error', (err) => {
      console.error('🔴 MongoDB connection error after startup:', err.message);
    });

    // Create indexes in background
    createIndexes().catch(err => console.error('Error creating indexes:', err));

    return conn;
  } catch (remoteError) {
    console.warn('⚠️ Remote MongoDB connection failed. Attempting to connect to LOCAL MongoDB...');
    
    try {
      const conn = await mongoose.connect(localUri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`✅ Connected to LOCAL MongoDB: ${conn.connection.host}`);
      
      // Global error listener for errors after initial connection
      mongoose.connection.on('error', (err) => {
        console.error('🔴 MongoDB connection error (Local) after startup:', err.message);
      });

      // Create indexes in background
      createIndexes().catch(err => console.error('Error creating indexes:', err));

      return conn;
    } catch (localError) {
      console.error('❌ Failed to connect to both Remote and Local MongoDB.');
      console.error('Remote Error:', remoteError.message);
      console.error('Local Error:', localError.message);
      process.exit(1);
    }
  }
};

const createIndexes = async () => {
  try {
    const User       = require('@models/User');
    const Enrollment = require('@models/Enrollment');
    const Course     = require('@models/Course');

    // Check if models are available (prevents circular dependency issues during startup)
    if (User && User.collection) {
      // The User model already defines unique constraints via schema (email, phone).
      // Only create performance-oriented indexes here, not unique constraints.
      await User.collection.createIndex({ email: 1 }, { background: true }).catch(() => {});
    }
    if (Enrollment && Enrollment.collection) {
      await Enrollment.collection.createIndex({ userId: 1, courseId: 1 });
    }
    if (Course && Course.collection) {
      await Course.collection.createIndex({ isActive: 1 });
    }

  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

module.exports = connectDB;
