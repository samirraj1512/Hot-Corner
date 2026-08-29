
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarIcon, ChevronLeft, ChevronRight, StarIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContextCore'

const RELEASES_CACHE_KEY = 'homeHeroReleases'
const RELEASES_CACHE_TTL = 30 * 60 * 1000

const getCachedReleases = () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(RELEASES_CACHE_KEY))
    if (!cached?.movies || Date.now() - cached.savedAt > RELEASES_CACHE_TTL) return []
    return cached.movies
  } catch {
    return []
  }
}

const cacheReleases = (movies) => {
  try {
    sessionStorage.setItem(RELEASES_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), movies }))
  } catch {
    // Ignore private-mode or storage-limit failures; the page can still fetch normally.
  }
}

const getHeroImageUrl = (movie, imageBaseUrl) => {
  const imagePath = movie?.backdrop_path || movie?.poster_path
  if (!imagePath) return ''
  return imagePath.startsWith('http') ? imagePath : `${imageBaseUrl}${imagePath}`
}

const HeroDots = ({ movies, currentIndex, onSelect, position }) => (
  <div className={`absolute ${position} left-1/2 -translate-x-1/2 z-20 flex max-w-[85vw] flex-wrap justify-center gap-2 px-3 py-2 rounded-full bg-black/20 backdrop-blur-sm`}>
    {movies.map((movie, index) => (
      <button
        key={`${movie._id || movie.id || movie.title}-${position}-${index}`}
        onClick={() => onSelect(index)}
        aria-label={`Show banner ${index + 1}`}
        className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
          index === currentIndex ? 'w-8 bg-primary' : 'w-2.5 bg-white/50 hover:bg-white'
        }`}
      />
    ))}
  </div>
)
//fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
const HeroSection = () => {
  const navigate = useNavigate()
  const { axios, shows, image_base_url } = useAppContext()
  const [releases, setReleases] = useState(() => getCachedReleases())
  const [currentIndex, setCurrentIndex] = useState(0)

  const heroMovies = useMemo(() => {
    return releases.length > 0 ? releases : shows
  }, [shows, releases])

  const activeIndex = heroMovies.length > 0 ? currentIndex % heroMovies.length : 0
  const currentMovie = heroMovies[activeIndex]
  const showingMovie = shows.find((movie) =>
    String(movie._id) === String(currentMovie?._id || currentMovie?.id)
  )
  const canBookCurrentMovie = Boolean(showingMovie)

  const handleNext = () => {
    setCurrentIndex((index) => (index + 1) % heroMovies.length)
  }

  const handlePrevious = () => {
    setCurrentIndex((index) => (index - 1 + heroMovies.length) % heroMovies.length)
  }

  const fetchReleases = useCallback(async () => {
    const cachedReleases = getCachedReleases()
    if (cachedReleases.length > 0) {
      setReleases(cachedReleases)
      return
    }

    try {
      const { data } = await axios.get('/api/show/releases')
      if (data.success) {
        setReleases(data.movies)
        cacheReleases(data.movies)
      }
    } catch (error) {
      console.error(error)
    }
  }, [axios])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  useEffect(() => {
    heroMovies.slice(0, 8).forEach((movie) => {
      const imageUrl = getHeroImageUrl(movie, image_base_url)
      if (imageUrl) {
        const image = new Image()
        image.src = imageUrl
      }
    })
  }, [heroMovies, image_base_url])

  useEffect(() => {
    if (heroMovies.length <= 1) return

    const interval = setInterval(() => {
      setCurrentIndex((index) => (index + 1) % heroMovies.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [heroMovies.length])

  useEffect(() => {
    setCurrentIndex(0)
  }, [heroMovies.length])

  if (!currentMovie) {
    return (
      <div className='flex flex-col items-start justify-center gap-6 px-6 md:px-16 lg:px-36 bg-[url("/backgroundImage.png")] bg-cover bg-center h-screen'>
        <h1 className='text-5xl md:text-[70px] md:leading-18 font-semibold max-w-110 text-black'>Movies</h1>
        <button onClick={() => navigate('/movies')} className='flex item-center gap-1 px-6 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>
          Explore Movies
          <ArrowRight className='w-5 h-5' />
        </button>
      </div>
    )
  }

  const releaseYear = currentMovie.release_date ? new Date(currentMovie.release_date).getFullYear() : 'Coming soon'
  const genres = currentMovie.genres?.slice(0, 3).map((genre) => genre.name).join(' | ')
  const hasMultipleMovies = heroMovies.length > 1

  return (
    <div className='relative flex flex-col items-start justify-center gap-6 px-6 md:px-16 lg:px-36 bg-cover bg-center h-screen overflow-hidden'>
      {heroMovies.map((movie, index) => {
        const movieImageUrl = getHeroImageUrl(movie, image_base_url)

        return (
          <div
            key={movie._id || movie.id || movie.title}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out ${
              index === activeIndex ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ backgroundImage: `url("${movieImageUrl}")` }}
          />
        )
      })}
      <div className='absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent' />
      <div className='absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20' />

      {hasMultipleMovies && (
        <>
          <HeroDots movies={heroMovies} currentIndex={activeIndex} onSelect={setCurrentIndex} position='bottom-8' />

          <button
            onClick={handlePrevious}
            aria-label='Previous movie banner'
            className='absolute left-3 md:left-8 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/20 p-3 text-white/80 backdrop-blur-sm transition hover:bg-primary/80 hover:text-white cursor-pointer'
          >
            <ChevronLeft className='h-7 w-7' />
          </button>
          <button
            onClick={handleNext}
            aria-label='Next movie banner'
            className='absolute right-3 md:right-8 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/20 p-3 text-white/80 backdrop-blur-sm transition hover:bg-primary/80 hover:text-white cursor-pointer'
          >
            <ChevronRight className='h-7 w-7' />
          </button>
        </>
      )}

      <div className='relative z-10 max-w-2xl mt-20'>
        <p className='text-primary font-medium mb-3'>{canBookCurrentMovie ? 'Now Showing' : 'New Release'}</p>
        <h1 className='text-5xl md:text-[70px] md:leading-18 font-semibold max-w-150'>{currentMovie.title}</h1>
        <div className='flex flex-wrap item-center gap-4 text-gray-300 mt-4'>
          {genres && <span>{genres}</span>}
          <div className='flex items-center gap-1'>
            <CalendarIcon className='w-4.5 h-4.5' /> {releaseYear}
          </div>
          <div className='flex items-center gap-1'>
            <StarIcon className='w-4.5 h-4.5 text-primary fill-primary' /> {currentMovie.vote_average?.toFixed(1) || 'New'}
          </div>
        </div>
        <p className='max-w-xl text-gray-300 mt-4 line-clamp-3'>{currentMovie.overview}</p>
        <button
          onClick={() => navigate(canBookCurrentMovie ? `/movies/${showingMovie._id}` : '/Releases')}
          className='flex item-center gap-1 px-6 py-3 mt-6 text-sm bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'
        >
          {canBookCurrentMovie ? 'Buy Tickets' : 'Explore Releases'}
          <ArrowRight className='w-5 h-5' />
        </button>
      </div>
    </div>
  )
}

export default HeroSection
