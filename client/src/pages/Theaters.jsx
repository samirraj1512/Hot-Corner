import React, { useEffect, useMemo, useState } from 'react'
import { SearchIcon, StarIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import BlurCircle from '../components/BlurCircle'
import { useAppContext } from '../context/AppContextCore'
import timeFormat from '../lib/timeFormat'

const RECOMMENDATIONS_PER_PAGE = 8

const normalizeTitle = (title = '') => title.toLowerCase().replace(/[^a-z0-9]/g, '')

const getMovieImage = (movie, imageBaseUrl) => {
  const image = movie.backdrop_path || movie.poster_path || movie.image || movie.poster
  if (!image) return ''
  return image.startsWith('http') ? image : `${imageBaseUrl || ''}${image}`
}

const getGenreText = (genres = []) => {
  if (!Array.isArray(genres) || genres.length === 0) return ''

  return genres
    .slice(0, 2)
    .map((genre) => (typeof genre === 'string' ? genre : genre.name))
    .filter(Boolean)
    .join(' | ')
}

const RecommendationCard = ({ movie, showingMovie, imageBaseUrl, onDetails, onBook }) => {
  const image = getMovieImage(movie, imageBaseUrl)
  const genres = getGenreText(movie.genres)
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : ''
  const releaseYear = Number.isNaN(year) ? '' : year
  const rating = Number(movie.vote_average || movie.rating || movie.score)
  const runtime = Number(movie.runtime)

  return (
    <div className='flex flex-col justify-between p-3 bg-gray-800 rounded-2xl hover:-translate-y-1 transition duration-300 w-66 min-h-80'>
      {image ? (
        <img onClick={() => onDetails(movie)} src={image} alt={movie.title} className='rounded-lg h-52 w-full object-cover object-right-bottom cursor-pointer' />
      ) : (
        <div onClick={() => onDetails(movie)} className='rounded-lg h-52 w-full bg-white/10 flex items-center justify-center text-center px-4 text-gray-300 cursor-pointer'>
          {movie.title}
        </div>
      )}

      <div>
        <p onClick={() => onDetails(movie)} className='font-semibold mt-2 truncate cursor-pointer'>{movie.title}</p>
        <p className='text-sm text-gray-400 mt-2 line-clamp-2 min-h-10'>
          {movie.overview || (showingMovie ? 'Available for booking now.' : 'Recommended by your movie model.')}
        </p>
        {(releaseYear || genres) && (
          <p className='text-xs text-gray-500 mt-2'>
            {[releaseYear, genres, runtime > 0 ? timeFormat(runtime) : ''].filter(Boolean).join(' • ')}
          </p>
        )}
      </div>

      <div className='flex items-center justify-between mt-4 pb-3 gap-3'>
        {showingMovie ? (
          <button
            onClick={() => onBook(showingMovie._id)}
            className='px-4 py-2 text-xs bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'
          >
            Buy Tickets
          </button>
        ) : (
          <button
            onClick={() => onDetails(movie)}
            className='px-4 py-2 text-xs bg-white/10 hover:bg-primary/80 transition rounded-full font-medium cursor-pointer'
          >
            View Details
          </button>
        )}

        {!Number.isNaN(rating) && rating > 0 && (
          <p className='flex items-center gap-1 text-sm'>
            <StarIcon className='w-4 h-4 text-primary fill-primary' />
            {rating.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  )
}

const Theaters = () => {
  const { axios, image_base_url, navigate, shows } = useAppContext()
  const [movieName, setMovieName] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [visibleCount, setVisibleCount] = useState(RECOMMENDATIONS_PER_PAGE)

  const showsByKey = useMemo(() => {
    const map = new Map()
    shows.forEach((movie) => {
      map.set(normalizeTitle(movie.title), movie)
      map.set(String(movie._id), movie)
    })
    return map
  }, [shows])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    const query = movieName.trim()

    if (query.length < 2) {
      setSuggestions([])
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true)
        const { data } = await axios.get('/api/recommendations/search', {
          params: { query },
          signal: controller.signal,
        })

        if (data.success) {
          setSuggestions(data.movies || [])
          setShowSuggestions(true)
        } else {
          toast.error(data.message)
        }
      } catch (error) {
        if (error.code !== 'ERR_CANCELED') {
          console.error(error)
        }
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [axios, movieName])

  const fetchRecommendations = async (selectedMovie = movieName) => {
    const movie = selectedMovie.trim()

    if (!movie) {
      toast.error('Enter a movie name first')
      return
    }

    try {
      setMovieName(movie)
      setShowSuggestions(false)
      setIsLoading(true)
      setHasSearched(true)

      const { data } = await axios.post('/api/recommendations', { movie })

      if (data.success) {
        setRecommendations(data.recommendations || [])
        setVisibleCount(RECOMMENDATIONS_PER_PAGE)
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(error.response?.data?.message || 'Could not fetch recommendations')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    fetchRecommendations()
  }

  const handleBook = (movieId) => {
    navigate(`/movies/${movieId}`)
    scrollTo(0, 0)
  }

  const handleDetails = (movie) => {
    navigate(`/movies/${movie.id || movie._id}`)
    scrollTo(0, 0)
  }

  const visibleRecommendations = recommendations.slice(0, visibleCount)
  const hasMoreRecommendations = visibleCount < recommendations.length

  return (
    <div className='relative my-40 mb-60 px-6 md:px-16 lg:px-30 overflow-hidden min-h-[80vh]'>
      <BlurCircle top='120px' left='0px' />
      <BlurCircle bottom='160px' right='40px' />

      <div className='max-w-3xl'>
        <p className='text-primary text-sm font-medium mb-2'>Movie Recommendation System</p>
        <h1 className='text-3xl md:text-5xl font-semibold text-balance'>Find movies similar to what you like</h1>
        <p className='text-gray-400 mt-4 max-w-2xl'>
          Type a movie name, choose one of the suggestions , and get recommendations instantly what to watch.
        </p>
      </div>

      <form onSubmit={handleSubmit} className='relative max-w-3xl mt-8'>
        <div className='flex flex-col sm:flex-row gap-3'>
          <div className='relative flex-1'>
            <SearchIcon className='absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400' />
            <input
              value={movieName}
              onChange={(event) => setMovieName(event.target.value)}
              onFocus={() => movieName.trim().length >= 2 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder='Search a movie name'
              className='w-full rounded-full bg-white/10 border border-white/10 py-3 pl-12 pr-4 outline-none focus:border-primary'
            />

            {showSuggestions && (suggestions.length > 0 || isSearching) && (
              <div className='absolute z-20 top-14 left-0 right-0 bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-xl'>
                {isSearching && (
                  <p className='px-4 py-3 text-sm text-gray-400'>Fetching movie options...</p>
                )}
                {!isSearching &&
                  suggestions.map((movie) => (
                    <button
                      key={movie.id || movie.title}
                      type='button'
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setMovieName(movie.title)
                        setShowSuggestions(false)
                      }}
                      className='w-full text-left px-4 py-3 hover:bg-white/10 transition cursor-pointer'
                    >
                      {movie.title}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <button
            type='submit'
            disabled={isLoading}
            className='px-8 py-3 bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer disabled:opacity-60'
          >
            {isLoading ? 'Finding...' : 'Recommend'}
          </button>
        </div>
      </form>

      <div className='mt-12'>
        <div className='flex items-end justify-between gap-4 flex-wrap'>
          <div>
            <h2 className='text-lg font-medium'>Recommended Movies</h2>
            <p className='text-sm text-gray-400 mt-1'>
              Results come from your Python recommendation API.
            </p>
          </div>
        </div>

        {recommendations.length > 0 ? (
          <div className='flex flex-wrap max-sm:justify-center gap-8 mt-6'>
            {visibleRecommendations.map((movie) => {
              const showingMovie = showsByKey.get(String(movie.id)) || showsByKey.get(normalizeTitle(movie.title))

              return (
                <RecommendationCard
                  key={movie.id || movie.title}
                  movie={movie}
                  showingMovie={showingMovie}
                  imageBaseUrl={image_base_url}
                  onDetails={handleDetails}
                  onBook={handleBook}
                />
              )
            })}
          </div>
        ) : (
          <div className='mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-gray-400'>
            {hasSearched
              ? 'No recommendations came back for that movie.'
              : 'Search for a movie to see recommendations here.'}
          </div>
        )}

        {hasMoreRecommendations && (
          <div className='flex justify-center mt-10'>
            <button
              onClick={() => setVisibleCount((count) => count + RECOMMENDATIONS_PER_PAGE)}
              className='px-8 py-3 bg-white/10 hover:bg-primary/80 transition rounded-full font-medium cursor-pointer'
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Theaters
