//A reusable card component that displays one movie's info and navigates to its detail page on click.

import { StarIcon } from 'lucide-react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import timeFormat from '../lib/timeFormat'
import { useAppContext } from '../context/AppContextCore'

const MoviesCard = ({movie}) => {

    const navigate = useNavigate()
    const{image_base_url}=useAppContext()
    const imagePath = movie.backdrop_path || movie.poster_path
    const imageUrl = imagePath
      ? imagePath.startsWith('http') ? imagePath : image_base_url + imagePath
      : '/backgroundImage.png'
    const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : ''
    const genres = Array.isArray(movie.genres) ? movie.genres.slice(0,2).map(genre=>genre.name).filter(Boolean).join(" | ") : ''
    const runtime = Number(movie.runtime || 0)
    const rating = Number(movie.vote_average || 0)

  return (
    <div className='flex flex-col justify-between p-3 bg-gray-800 rounded-2xl hover:-translate-y-1 transition duration-300 w-66'>
        <img onClick={()=> {navigate(`/movies/${movie._id}`); window.scrollTo(0,0)}} src={imageUrl} alt="" className='rounded-lg h-52 w-full object-cover object-right-bottom cursor-pointer'/>
        <p className='font-semibold mt-2 truncate'>
            {movie.title}
        </p>

        <p className='text-sm text-gray-400 mt-2'>
            {[releaseYear, genres, runtime > 0 ? timeFormat(runtime) : ''].filter(Boolean).join(' • ')}
        </p>

        <div className='flex items-center justify-between mt-4 pb-3'> 
            <button onClick={()=> {navigate(`/movies/${movie._id}`); window.scrollTo(0,0)}} className='px-4 py-2 text-xs bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>Buy Tickets</button>
            <p>
                <StarIcon className='w-4 h-4 text-primary fill-primary'/>
                {rating > 0 ? rating.toFixed(1) : 'New'}
            </p>
        </div>

    </div>
  )
}

export default MoviesCard
