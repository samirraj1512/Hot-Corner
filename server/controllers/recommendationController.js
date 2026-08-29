import axios from 'axios';

const getPythonApiUrl = () =>
  (process.env.RECOMMENDATION_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const normalizePath = (path) => (path.startsWith('/') ? path : `/${path}`);

const getTimeout = () => Number(process.env.RECOMMENDATION_API_TIMEOUT_MS) || 30000;

const tmdbHeaders = () => ({
  accept: 'application/json',
  Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
});

const buildConfiguredPath = (path, value) =>
  path
    .replace(':query', encodeURIComponent(value))
    .replace(':movie', encodeURIComponent(value))
    .replace('{query}', encodeURIComponent(value))
    .replace('{movie}', encodeURIComponent(value));

const extractList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const listKeys = [
    'recommendations',
    'recommended_movies',
    'recommended',
    'movies',
    'movie_names',
    'movie_list',
    'suggestions',
    'results',
    'titles',
    'data',
  ];

  for (const key of listKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  for (const key of listKeys) {
    const nested = extractList(payload[key]);
    if (nested.length > 0) return nested;
  }

  return [];
};

const normalizeMovie = (movie, index) => {
  if (typeof movie === 'string') {
    return {
      id: movie,
      title: movie,
    };
  }

  const title =
    movie?.title ||
    movie?.name ||
    movie?.movie ||
    movie?.movie_name ||
    movie?.movieTitle ||
    movie?.movie_title ||
    movie?.Movie ||
    movie?.Title ||
    '';

  return {
    ...movie,
    id: movie?.id || movie?._id || movie?.movie_id || title || index,
    title,
  };
};

const normalizeMovies = (payload) =>
  extractList(payload)
    .map(normalizeMovie)
    .filter((movie) => movie.title);

const canFetchTmdbDetails = (movie) =>
  process.env.TMDB_API_KEY && movie.id && /^\d+$/.test(String(movie.id));

const normalizeTitleForCompare = (title = '') =>
  title.toLowerCase().replace(/[^a-z0-9]/g, '');

const hasTmdbImage = (movie) => Boolean(movie.poster_path || movie.backdrop_path);

const mapTmdbMovie = (movie, tmdbMovie) => ({
  ...movie,
  _id: String(tmdbMovie.id),
  id: tmdbMovie.id,
  title: tmdbMovie.title || movie.title,
  overview: tmdbMovie.overview,
  poster_path: tmdbMovie.poster_path,
  backdrop_path: tmdbMovie.backdrop_path,
  original_language: tmdbMovie.original_language,
  release_date: tmdbMovie.release_date,
  genres: tmdbMovie.genres || movie.genres || [],
  vote_average: tmdbMovie.vote_average,
  runtime: tmdbMovie.runtime || movie.runtime,
  tagline: tmdbMovie.tagline || movie.tagline || '',
});

const fetchTmdbMovieById = async (movie) => {
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}`, {
      headers: tmdbHeaders(),
      timeout: getTimeout(),
    });

    return mapTmdbMovie(movie, data);
  } catch (error) {
    console.error(`Could not fetch TMDB details for ${movie.title}:`, error.message);
    return null;
  }
};

const fetchTmdbMovieByTitle = async (movie) => {
  try {
    const { data } = await axios.get('https://api.themoviedb.org/3/search/movie', {
      headers: tmdbHeaders(),
      params: { query: movie.title, include_adult: false, language: 'en-US', page: 1 },
      timeout: getTimeout(),
    });

    const expectedTitle = normalizeTitleForCompare(movie.title);
    const exactMatch = data.results?.find(
      (result) =>
        normalizeTitleForCompare(result.title) === expectedTitle ||
        normalizeTitleForCompare(result.original_title) === expectedTitle
    );
    const matchWithImage =
      data.results?.find((result) => normalizeTitleForCompare(result.title).includes(expectedTitle) && hasTmdbImage(result)) ||
      data.results?.find((result) => hasTmdbImage(result)) ||
      exactMatch ||
      data.results?.[0];

    if (!matchWithImage) return null;

    return fetchTmdbMovieById({ ...movie, id: matchWithImage.id });
  } catch (error) {
    console.error(`Could not search TMDB details for ${movie.title}:`, error.message);
    return null;
  }
};

const enrichMovieWithTmdb = async (movie) => {
  if (!process.env.TMDB_API_KEY) return movie;

  const movieFromId = canFetchTmdbDetails(movie) ? await fetchTmdbMovieById(movie) : null;
  if (movieFromId && hasTmdbImage(movieFromId)) return movieFromId;

  const movieFromTitle = await fetchTmdbMovieByTitle(movie);
  if (movieFromTitle) return movieFromTitle;

  return movieFromId || movie;
};

const enrichMoviesWithTmdb = async (movies) => Promise.all(movies.map(enrichMovieWithTmdb));

const callPythonApi = async (candidates) => {
  const baseUrl = getPythonApiUrl();
  let lastError;

  for (const candidate of candidates) {
    try {
      const response = await axios({
        method: candidate.method,
        url: `${baseUrl}${normalizePath(candidate.path)}`,
        params: candidate.params,
        data: candidate.data,
        timeout: getTimeout(),
      });

      return response.data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const getApiErrorMessage = (error, action) => {
  const status = error.response?.status;

  if (status === 502 || status === 503 || status === 504) {
    return `The Python recommendation API is deployed, but Render is returning ${status}. Check the Render logs because the Flask app is likely crashing, still starting, or not binding to the Render PORT.`;
  }

  if (status === 404) {
    return `The Python recommendation API could not find that movie for ${action}. Choose a movie from the suggestions and try again.`;
  }

  if (error.code === 'ECONNABORTED') {
    return 'The Python recommendation API took too long to respond. Render may be waking up or the model may be too heavy for the instance.';
  }

  return `Could not fetch ${action} from the Python recommendation API. Make sure it is running and RECOMMENDATION_API_URL is correct.`;
};


export const searchRecommendationMovies = async (req, res) => {
  const query = (req.query.query || req.query.q || '').trim();

  if (query.length < 2) {
    return res.json({ success: true, movies: [] });
  }

  const configuredPath = process.env.RECOMMENDATION_SEARCH_PATH;
  const candidates = configuredPath
    ? [
        {
          method: process.env.RECOMMENDATION_SEARCH_METHOD || 'get',
          path: buildConfiguredPath(configuredPath, query),
          params: { query, q: query },
          data: { query, q: query, movie: query },
        },
      ]
    : [
        { method: 'get', path: `/search/${encodeURIComponent(query)}` },
        { method: 'get', path: '/search', params: { query } },
        { method: 'get', path: '/search', params: { q: query } },
        { method: 'get', path: '/movies/search', params: { query } },
        { method: 'get', path: '/movies/search', params: { q: query } },
        { method: 'get', path: '/movies', params: { query } },
        { method: 'get', path: '/movies', params: { q: query } },
        { method: 'post', path: '/search', data: { query, q: query, movie: query } },
      ];

  try {
    const payload = await callPythonApi(candidates);
    const loweredQuery = query.toLowerCase();
    const movies = normalizeMovies(payload);
    const filteredMovies = movies.filter((movie) =>
      movie.title.toLowerCase().includes(loweredQuery)
    );

    res.json({ success: true, movies: (filteredMovies.length ? filteredMovies : movies).slice(0, 8) });
  } catch (error) {
    console.error('Error fetching movie suggestions:', error.message);
    res.status(502).json({
      success: false,
      message: getApiErrorMessage(error, 'movie suggestions'),
    });
  }
};

export const getMovieRecommendations = async (req, res) => {
  const movie = (req.body.movie || req.body.movieName || req.body.title || '').trim();

  if (!movie) {
    return res.status(400).json({ success: false, message: 'Movie name is required' });
  }

  const configuredPath = process.env.RECOMMENDATION_RECOMMEND_PATH;
  const data = { movie, movie_name: movie, title: movie };
  const candidates = configuredPath
    ? [
        {
          method: process.env.RECOMMENDATION_RECOMMEND_METHOD || 'get',
          path: buildConfiguredPath(configuredPath, movie),
          params: data,
          data,
        },
      ]
    : [
        { method: 'get', path: `/recommend/${encodeURIComponent(movie)}` },
        { method: 'post', path: '/recommend', data },
        { method: 'post', path: '/recommendations', data },
        { method: 'get', path: '/recommend', params: data },
        { method: 'get', path: '/recommendations', params: data },
      ];

  try {
    const payload = await callPythonApi(candidates);
    const recommendations = await enrichMoviesWithTmdb(normalizeMovies(payload));

    res.json({ success: true, recommendations });
  } catch (error) {
    console.error('Error fetching movie recommendations:', error.message);
    res.status(502).json({
      success: false,
      message: getApiErrorMessage(error, 'movie recommendations'),
    });
  }
};
