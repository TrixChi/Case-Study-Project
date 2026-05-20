import app from './app.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 ABC Learning Center API running on port ${PORT}`);
});

export default app;
