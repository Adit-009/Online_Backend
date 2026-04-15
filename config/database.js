const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Online_Learning_Platform';
    
    const conn = await mongoose.connect(mongoUri);
    
    // Create indexes in background
    createIndexes().catch(err => console.error('Error creating indexes:', err));
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const User = require('../models/User');
    const Enrollment = require('../models/Enrollment');
    const Course = require('../models/Course');
    
    // Check if models are available (prevents circular dependency issues during startup)
    if (User && User.collection) {
      // First, try to drop the old unique email index if it exists to avoid conflicts
      try { await User.collection.dropIndex('email_1'); } catch (e) { /* ignore if not exists */ }
      
      // Create compound index for email + role to allow duplicate emails across different roles
      await User.collection.createIndex({ email: 1, role: 1 }, { unique: true });
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
