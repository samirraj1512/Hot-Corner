import React, { useCallback, useEffect, useState } from 'react'
import { CalendarDaysIcon, ThumbsUpIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { SignInButton } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import BlurCircle from '../components/BlurCircle'
import Loading from '../components/Loading'
import { useAppContext } from '../context/AppContextCore'

const Releases = () => {
  const { axios, getToken, image_base_url, user } = useAppContext()
  const navigate = useNavigate()
  const [movies, setMovies] = useState([])
  const [loading, setLoading] = useState(true)
  const [votingMovieId, setVotingMovieId] = useState(null)

  const fetchReleases = useCallback(async () => {
    const loadReleases = async (retries = 4, delay = 1000) => {
      try {
        const token = user ? await getToken() : null
        const { data } = await axios.get('/api/show/releases', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })

        if (data.success) {
          setMovies(data.movies)
        } else {
          toast.error(data.message)
        }
      } catch (error) {
        if (retries > 0) {
          await new Promise(res => setTimeout(res, delay))
          return loadReleases(retries - 1, delay * 1.5)
        }
        console.error(error)
        toast.error('Could not load releases. Please try again.')
      }
    }

    try {
      setLoading(true)
      await loadReleases()
    } finally {
      setLoading(false)
    }
  }, [axios, getToken, user])

  const handleUpvote = async (movieId) => {
    try {
      setVotingMovieId(movieId)
      const { data } = await axios.post(
        '/api/show/releases/upvote',
        { movieId },
        { headers: { Authorization: `Bearer ${await getToken()}` } }
      )

      if (data.success) {
        setMovies((currentMovies) =>
          currentMovies
            .map((movie) =>
              movie.id === movieId
                ? { ...movie, upvotes: data.upvotes, isUpvoted: data.isUpvoted }
                : movie
            )
            .sort((a, b) => b.upvotes - a.upvotes || a.voteRank - b.voteRank)
        )
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      console.error(error)
      toast.error(error.message)
    } finally {
      setVotingMovieId(null)
    }
  }

  const openMovieDetails = (movieId) => {
    navigate(`/movies/${movieId}`)
    scrollTo(0, 0)
  }

  useEffect(() => {
    window.scrollTo(0, 0)
    fetchReleases()
  }, [fetchReleases])

  if (loading) return <Loading />

  return movies.length > 0 ? (
    <div className='relative my-40 mb-28 px-6 md:px-16 lg:px-30 overflow-hidden min-h-[80vh]'>
      <BlurCircle top='150px' left='0px' />
      <BlurCircle bottom='120px' right='50px' />
      <div className='flex items-end justify-between gap-4 my-4'>
        <div>
          <h1 className='text-lg font-medium'>New Releases</h1>
          <p className='text-sm text-gray-400 mt-1'>Vote for the movies you want added next.</p>
        </div>
      </div>

      <div className='flex flex-wrap max-sm:justify-center gap-8'>
        {movies.map((movie) => (
          <div key={movie.id} className='flex flex-col justify-between p-3 bg-gray-800 rounded-2xl hover:-translate-y-1 transition duration-300 w-66'>
            <img
              onClick={() => openMovieDetails(movie.id)}
              src={movie.backdrop_path ? image_base_url + movie.backdrop_path : image_base_url + movie.poster_path}
              alt={movie.title}
              className='rounded-lg h-52 w-full object-cover object-right-bottom cursor-pointer'
            />
            <p onClick={() => openMovieDetails(movie.id)} className='font-semibold mt-2 truncate cursor-pointer'>{movie.title}</p>
            <p className='text-sm text-gray-400 mt-2 line-clamp-2 min-h-10'>{movie.overview || 'No overview available.'}</p>
            <p className='text-sm text-gray-400 mt-3 flex items-center gap-2'>
              <CalendarDaysIcon className='w-4 h-4 text-primary' />
              {movie.release_date || 'Release date unavailable'}
            </p>

            <div className='flex items-center justify-between mt-4 pb-3'>
              {user ? (
                <button
                  onClick={() => handleUpvote(movie.id)}
                  disabled={votingMovieId === movie.id}
                  className={`px-4 py-2 text-xs transition rounded-full font-medium cursor-pointer flex items-center gap-2 disabled:opacity-60 ${movie.isUpvoted ? 'bg-primary text-white' : 'bg-white/10 hover:bg-primary/80'}`}
                >
                  <ThumbsUpIcon className={`w-4 h-4 ${movie.isUpvoted ? 'fill-white' : ''}`} />
                  Upvote
                </button>
              ) : (
                <SignInButton mode='modal'>
                  <button className='px-4 py-2 text-xs bg-white/10 hover:bg-primary/80 transition rounded-full font-medium cursor-pointer flex items-center gap-2'>
                    <ThumbsUpIcon className='w-4 h-4' />
                    Upvote
                  </button>
                </SignInButton>
              )}
              <p className='text-sm text-gray-300'>{movie.upvotes} upvotes</p>
            </div>
            <button
              onClick={() => openMovieDetails(movie.id)}
              className='w-full px-4 py-2 text-xs bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center h-screen'>
      <h1 className='text-4xl font-bold text-center'>No Releases Available</h1>
    </div>
  )
}

export default Releases
