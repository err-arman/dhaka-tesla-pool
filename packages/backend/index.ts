const express = require('express');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000; 


app.get('/api', (req: any, res: any) => {
  res.json({ message: "Hello from the Express backend!" });
});

app.listen(port, () => console.log(`Backend running on port ${port}`));