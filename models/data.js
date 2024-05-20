const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  uniqueCode: String,
  metaData: {
      newsUrl: String,
      mapUrl: String,
      latitude: String,
      longitude: String,
      locationName: String,
      category: String,
      newsTag: String,
      date: { type: Date, default: Date.now },
  }
});
  
  
  const Data = mongoose.model('Data', dataSchema);

module.exports = Data
