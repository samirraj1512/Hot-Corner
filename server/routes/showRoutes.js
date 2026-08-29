import express from 'express'
import { addShow, autoAddDailyShows, deleteShow, getNowPlayingMovies, getReleases, getShow, getShows, getUpcomingTrailers, toggleReleaseUpvote } from '../controllers/showController.js'
import { protectAdmin } from '../middleware/auth.js'



const showRouter = express.Router()

showRouter.get('/now-playing',protectAdmin, getNowPlayingMovies)
showRouter.post('/add',protectAdmin, addShow)
showRouter.post('/auto-add-daily',protectAdmin, autoAddDailyShows)
showRouter.get('/releases',getReleases)
showRouter.post('/releases/upvote',toggleReleaseUpvote)
showRouter.get('/upcoming-trailers',getUpcomingTrailers)
showRouter.get('/all',getShows)
showRouter.delete('/:showId',protectAdmin,deleteShow)
showRouter.get('/:movieId',getShow)


export default showRouter;
