import express from 'express';
import {
  getMovieRecommendations,
  searchRecommendationMovies,
} from '../controllers/recommendationController.js';

const recommendationRouter = express.Router();

recommendationRouter.get('/search', searchRecommendationMovies);
recommendationRouter.post('/', getMovieRecommendations);

export default recommendationRouter;
