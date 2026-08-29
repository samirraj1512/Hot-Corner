import axios from 'axios';
import Movie from '../models/Movie.js';
import Show from '../models/Show.js';

const tmdbHeaders = () => ({
  accept: 'application/json',
  Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
});

const TMDB_REQUEST_TIMEOUT_MS = 15000;
const TMDB_MAX_RETRIES = 2;
const TMDB_RETRY_DELAY_MS = 750;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableTmdbError = (error) => {
  const status = error.response?.status;
  const retryableCodes = ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EAI_AGAIN'];

  return retryableCodes.includes(error.code)
    || status === 429
    || (status >= 500 && status < 600);
};

const fetchTmdb = async (url, params = {}) => {
  for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt += 1) {
    try {
      return await axios.get(url, {
        headers: tmdbHeaders(),
        params,
        timeout: TMDB_REQUEST_TIMEOUT_MS,
      });
    } catch (error) {
      const shouldRetry = attempt < TMDB_MAX_RETRIES && isRetryableTmdbError(error);

      if (!shouldRetry) {
        throw error;
      }

      await sleep(TMDB_RETRY_DELAY_MS * (attempt + 1));
    }
  }
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

const formatDate = (date) => date.toISOString().split('T')[0];

const timeOptions = ['10:00', '12:45', '15:30', '18:15', '21:00', '23:15'];

const randomShowDateTime = (daysAhead) => {
  const date = new Date();
  date.setDate(date.getDate() + randomInt(1, daysAhead));

  return new Date(`${formatDate(date)}T${timeOptions[randomInt(0, timeOptions.length - 1)]}:00+05:30`);
};

const getAutoShowConfig = () => ({
  movieCount: Number(process.env.AUTO_SHOW_MOVIE_COUNT) || 0,
  daysAhead: Number(process.env.AUTO_SHOW_DAYS_AHEAD) || 7,
  timesPerMovie: Number(process.env.AUTO_SHOW_TIMES_PER_MOVIE) || 2,
  minPrice: Number(process.env.AUTO_SHOW_MIN_PRICE) || 150,
  maxPrice: Number(process.env.AUTO_SHOW_MAX_PRICE) || 500,
});

const buildMovieDetails = (movieApiData, movieCreditsData) => {
  const filteredCasts = (movieCreditsData.cast || []).slice(0, 20).map((cast) => ({
    id: cast.id,
    name: cast.name,
    character: cast.character,
    profile_path: cast.profile_path,
    gender: cast.gender,
    order: cast.order,
  }));

  return {
    _id: movieApiData.id.toString(),
    title: movieApiData.title || movieApiData.original_title || 'Untitled Movie',
    overview: movieApiData.overview || 'No overview available.',
    poster_path: movieApiData.poster_path,
    backdrop_path: movieApiData.backdrop_path,
    original_language: movieApiData.original_language,
    release_date: movieApiData.release_date || formatDate(new Date()),
    genres: movieApiData.genres || [],
    casts: filteredCasts,
    vote_average: movieApiData.vote_average || 0,
    runtime: movieApiData.runtime || 0,
    tagline: movieApiData.tagline || '',
  };
};

const ensureMovie = async (movieId) => {
  const existingMovie = await Movie.findById(movieId.toString());
  if (existingMovie) {
    return { movie: existingMovie, created: false };
  }

  const movieDetailsResponse = await fetchTmdb(`https://api.themoviedb.org/3/movie/${movieId}`);
  const movieCreditsResponse = await fetchTmdb(
    `https://api.themoviedb.org/3/movie/${movieId}/credits`,
    { language: 'en-US' }
  ).catch(() => ({ data: { cast: [] } }));

  const movieApiData = movieDetailsResponse.data;
  if (!movieApiData.poster_path || !movieApiData.backdrop_path) {
    return { movie: null, created: false };
  }

  const movie = await Movie.create(buildMovieDetails(movieApiData, movieCreditsResponse.data));
  return { movie, created: true };
};

const buildRandomShowTimes = (timesPerMovie, daysAhead) => {
  const showTimes = new Set();
  const maxUniqueShowTimes = daysAhead * timeOptions.length;
  const targetCount = Math.min(timesPerMovie, maxUniqueShowTimes);

  while (showTimes.size < targetCount) {
    showTimes.add(randomShowDateTime(daysAhead).toISOString());
  }

  return [...showTimes].map((showTime) => new Date(showTime));
};

export const autoCreateDailyShows = async () => {
  if (!process.env.TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is required for automatic show creation');
  }

  const config = getAutoShowConfig();
  const { data } = await fetchTmdb('https://api.themoviedb.org/3/movie/now_playing', {
    language: 'en-US',
    page: 1,
  });

  const futureMovieIds = new Set(
    (await Show.find({ showDateTime: { $gte: new Date() } }).distinct('movie')).map(String)
  );

  const eligibleMovies = (data.results || []).filter(
    (movie) =>
      movie.id &&
      movie.poster_path &&
      movie.backdrop_path &&
      !futureMovieIds.has(movie.id.toString())
  );
  const movieCount = config.movieCount > 0 ? config.movieCount : eligibleMovies.length;
  const selectedMovies = shuffle(eligibleMovies).slice(0, movieCount);

  let createdMovies = 0;
  let createdShows = 0;
  let skippedMovies = 0;

  for (const releaseMovie of selectedMovies) {
    const { movie, created } = await ensureMovie(releaseMovie.id);
    if (!movie) {
      skippedMovies += 1;
      continue;
    }

    if (created) createdMovies += 1;

    const showsToCreate = buildRandomShowTimes(config.timesPerMovie, config.daysAhead).map((showDateTime) => ({
      movie: movie._id,
      showDateTime,
      showPrice: randomInt(config.minPrice, config.maxPrice),
      occupiedSeats: {},
    }));

    const insertedShows = await Show.insertMany(showsToCreate);
    createdShows += insertedShows.length;
  }

  return {
    selectedMovies: selectedMovies.length,
    createdMovies,
    createdShows,
    skippedMovies,
  };
};
