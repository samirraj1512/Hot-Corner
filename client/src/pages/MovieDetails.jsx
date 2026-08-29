import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import BlurCircle from '../components/BlurCircle'
import { Heart, PlayCircleIcon, StarIcon } from 'lucide-react'
import timeFormat from '../lib/timeFormat'
import DateSelect from '../components/DateSelect'
import MoviesCard from '../components/MoviesCard'
import Loading from '../components/Loading'
import { useAppContext } from '../context/AppContextCore'
import toast from 'react-hot-toast'

const MovieDetails = () => {
 const navigate = useNavigate()
  const {id}= useParams()
    const [show,setShow]=useState(null)

    const {shows,axios,getToken,user,fetchFavoriteMovies,favoriteMovies,image_base_url}=useAppContext();

    const getShow = useCallback(async()=>{
      try {
        const {data} = await axios.get(`/api/show/${id}`)

        if(data.success){
          setShow(data)
        }
        
      } catch (error) {
            console.log(error)        
      }

 
    }, [axios, id])

    const handleTrailer = () => {
      const trailerUrl = show?.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${show.movie.title} official trailer`)}`
      window.open(trailerUrl, '_blank', 'noopener,noreferrer')
    }

    //hanndle favraiouts
const handelFavorite = async ()=> {
  try {
    if(!user) return toast.error("please first log in");
      
      const {data} = await axios.post('/api/user/update-favorite',{movieId: id},{
      headers:{Authorization:`Bearer ${await getToken()}`}
    })
    
      if(data.success){
        await fetchFavoriteMovies();
        toast.success(data.message)
      }

  } catch (error) {
  console.error("Error updating favorite:", error);
  toast.error("Could not update favorite.");
}

}



     
      useEffect(()=>{
        getShow()
      },[getShow])
      
  if (!show) return <Loading/>

  const hasShowDates = show.hasShows || Object.keys(show.dateTime || {}).length > 0
  const movieImage = show.movie.poster_path || show.movie.backdrop_path
  const releaseYear = show.movie.release_date ? show.movie.release_date.split("-")[0] : 'Coming soon'
  const rating = Number(show.movie.vote_average || 0)
  const runtime = Number(show.movie.runtime || 0)

  return (
    <div className='px-6 md:px-16 lg:px-36 pt-30 md:pt-40'>
    <div className='flex flex-col md:flex-row gap-8 max-w-8xl mx-auto'>
      <img src={movieImage ? image_base_url + movieImage : '/backgroundImage.png'} alt={show.movie.title} className='max-md:mx-auto rounded-xl h-104 max-w-70 object-cover'/>

      <div className='relative flex flex-col gap-3'>
        <BlurCircle top="-100px" left='-100px'/>
        <p className='text-primary'>{hasShowDates ? 'Now Showing' : 'Movie Details'}</p>
        <h1 className='text-4xl font-semibold max-w-96 text-balance'>{show.movie.title}</h1>

        <div className='flex items-center gap-2 text-gray-300'>
          <StarIcon className='w-5 h-5 text-primary fill-primary'/>
          {rating > 0 ? rating.toFixed(1) : 'New'} User Rating</div>
        
        <p className="text-gray-400 mt-2 text-sm leading-tight max-w-xl">{show.movie.overview}</p>

        <p>
          {[runtime > 0 ? timeFormat(runtime) : '', show.movie.genres?.map(genre=>genre.name).join(", "), releaseYear].filter(Boolean).join(' • ')}
        </p>

        <div className='flex items-center flex-wrap gap-4 mt-4'>
          <button onClick={handleTrailer} className='flex items-centre gap-2 px-7 py-3 text-sm bg-gray-800 hover:bg-gray-950 transition rounded-md font-medium cursor-pointer active:scale-95'>
            <PlayCircleIcon className={`w-5 h-5`}/>Watch Trailer</button>
          {hasShowDates && <a href="#dateSelect" className='px-10 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-md font-medium cursor-pointer'>Buy Ticket</a>}
          <button 
  onClick={handelFavorite}
  className='bg-gray-700 p-2.5 transition rounded-full cursor-pointer active:scale-95'
>
  <Heart className={`w-5 h-5 ${favoriteMovies.find(movie => movie._id?.toString() === id.toString()) ? 'fill-primary text-primary' : ''}`} />
</button>

          
        
        </div>
      </div>
      </div>
      <p className='text-lg font-medium mt-20'>Your Favorite Cast</p>
        <div className='overflow-x-auto no-scrollbar mt-8 pb-4'>
          <div className='flex items-center gap-4 w-max px-4'>
            {(show.movie.casts || []).slice(0,12).map((cast,index)=>(
              <div key={index} className='flex flex-col items-center text-center'>
                <img src={cast.profile_path ? image_base_url + cast.profile_path : '/backgroundImage.png'} alt={cast.name} className='rounded-full h-20 md:h-20 aspect-square object-cover'/>
                <p className='font-medium text-xs mt-3'>{cast.name}</p>
              </div>
            ))}
            
          </div>
        </div>
        {hasShowDates && <DateSelect dateTime={show.dateTime} id={id}/>}
        <p className='text-lg font-medium mt-20 mb-8'>You May also Like</p>
        <div className='flex flex-wrap max-sm:justify-center gap-8'> 
          {shows.slice(0,4).map((movie,index)=> (<MoviesCard key={index} movie={movie}/>))}
        </div>

        <div className='flex justify-center mt-20'>
                <button onClick={()=> {navigate("/movies");}} className='px-10 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-md font-medium cursor-pointer'>
                  Show Mores
                </button>
        </div>
    </div>

  )
}

export default MovieDetails
