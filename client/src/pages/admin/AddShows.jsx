import React, { useCallback, useEffect, useState } from 'react'
import Loading from '../../components/Loading';
import Title from '../../components/admin/Title';
import { CheckIcon, DeleteIcon, RefreshCwIcon, StarIcon, ThumbsUpIcon } from 'lucide-react';
import { useAppContext } from '../../context/AppContextCore';
import toast from 'react-hot-toast';


const AddShows = () => {

  const{axios,getToken,user,image_base_url}=useAppContext();

    const currency = import.meta.env.VITE_CURRENCY;

    const [nowPlayingMovies, setNowPlayingMovies] = useState([]);
    const [selectedMovies, setSelectedMovies] = useState(null);
    const [dateTimeSelection, setDateTimeSelection] = useState({});
    const [dateTimeInput, setDateTimeInput] = useState("");
    const [showPrice, setShowPrice] = useState("");
    const [loadingMovies, setLoadingMovies] = useState(true);
    const [moviesError, setMoviesError] = useState("");


    const[addingShow,setAddingShow]=useState(false);


    const fetchNowPlayingMovies= useCallback(async ()=>{
      try {
        setLoadingMovies(true);
        setMoviesError("");

         const {data} = await axios.get('/api/show/now-playing',{
          headers:{Authorization:`Bearer ${await getToken()}`}})

          if(data.success){
            setNowPlayingMovies(data.movies)
          } else {
            const message = data.message || 'Could not load now playing movies';
            setMoviesError(message);
            toast.error(message);
          }
      } catch (error) {
        console.error('error fetching movies',error)
        const message = error.response?.data?.message || 'Could not load now playing movies. Please try again.';
        setMoviesError(message);
        toast.error(message);
      } finally {
        setLoadingMovies(false);
      }
    }, [axios, getToken]);


       const handleDateTimeAdd = () => {
  if (!dateTimeInput) {
    toast.error('Choose a future date and time first')
    return
  }

  const selectedDateTime = new Date(dateTimeInput)
  if (Number.isNaN(selectedDateTime.getTime()) || selectedDateTime.getTime() <= Date.now()) {
    toast.error('Show times must be in the future')
    return
  }

  const [date, time] = dateTimeInput.split("T");
  if (!date || !time) return;

  setDateTimeSelection((prev) => {
    const times = prev[date] || [];
    if (!times.includes(time)) {
      return { ...prev, [date]: [...times, time] };
    }
    return prev;
  });
  setDateTimeInput("")
};

      const handleRemoveTime =(date,time)=>{
        setDateTimeSelection((prev)=>{
          const filteredTimes =prev[date].filter((t)=>t !== time);
          if(filteredTimes.length ===0){
            const {[date]: _, ...rest}=prev;
            return rest;
          }
          return{
            ...prev,[date]:filteredTimes,
          };
        });
      };


const handleSubmit = async()=>{
const price = Number(showPrice)
if(!selectedMovies || Object.keys(dateTimeSelection).length===0 || !Number.isFinite(price) || price <= 0){
  return toast.error('Choose a movie, add a future time, and enter a price greater than zero')
}

try {
  setAddingShow(true)

  const showsInput = Object.entries(dateTimeSelection).map(([date,time])=>({date,time}))

  const payload={
    movieId: selectedMovies,
    showsInput,
    showPrice:price
  }
   
const {data} = await axios.post('/api/show/add',payload,{headers:{Authorization:`Bearer ${await getToken()}`}})


if(data.success){
  toast.success(data.message)
  setSelectedMovies(null)
  setDateTimeSelection({})
  setShowPrice("")

}else{
  toast.error(data.message)
}



} catch (error) {
  console.error("Submmision error:",error)
  toast.error(error.response?.data?.message || 'an error occured plz try again')
  
} finally {
  setAddingShow(false)
}

      }


    useEffect(()=>{
      if(user){
          fetchNowPlayingMovies();
      }
      
    },[fetchNowPlayingMovies, user]);



  if (loadingMovies) return <Loading/>

  if (moviesError) {
    return (
      <>
        <Title text1="Add" text2="Shows"/>
        <div className='mt-20 flex flex-col items-start gap-4'>
          <p className='text-gray-300'>{moviesError}</p>
          <button
            onClick={fetchNowPlayingMovies}
            className='bg-primary text-white px-5 py-2 rounded hover:bg-primary/70 transition-all cursor-pointer inline-flex items-center gap-2'
          >
            <RefreshCwIcon className='w-4 h-4'/>
            Retry
          </button>
        </div>
      </>
    )
  }

  if (nowPlayingMovies.length === 0) {
    return (
      <>
        <Title text1="Add" text2="Shows"/>
        <p className='mt-20 text-gray-300'>No now playing movies available.</p>
      </>
    )
  }

  return (
    <>
    <Title text1="Add" text2="Shows"/>
    <p className='mt-20 text-lg font-medium'>Now Playing Movies</p>
      <div className='overflow-x-auto pb-4'>
        <div className='group flex flex-wrap gap-4 mt-4 w-max'>
          {nowPlayingMovies.map((movie)=>(
            <button type='button' onClick={()=>setSelectedMovies(movie.id)} key={movie.id} className={`relative max-w-40 text-left cursor-pointer group-hover:not-hover:opacity-60 hover:-translate-y-1 transition duration-300 ${selectedMovies === movie.id ? 'ring-1 ring-primary rounded-lg' : ''}`}>
                <div className='relative rounded-lg overflow-hidden'>
                  <img src={movie.poster_path ? image_base_url + movie.poster_path : '/backgroundImage.png'} alt="" className='w-full object-cover brightness-90'/>
                  <div className='text-sm flex items-center justify-between p-2 bg-black/60 w-full absolute bottom-0 left-0'> 
                    <p className="flex items-center gap-1 text-sm text-gray-400">
          <StarIcon className="w-4 h-4 text-primary fill-primary" />
          {Number(movie.vote_average || 0).toFixed(1)}
        </p>
        <p className='flex items-center gap-1'>
          <ThumbsUpIcon className='w-4 h-4 text-primary'/>
          {movie.upvotes || 0}
        </p>
                  </div>

                </div>
                {selectedMovies=== movie.id &&(
                  <div className='absolute top-2 right-2 flex items-center justify-center bg-primary h-6 w-6 rounded'>
                          <CheckIcon className='w-4 h-4 text-white' strokeWidth={2.5}/>
                </div>)}
                <p className='font-lg truncate'>{movie.title}</p>
                <p className='text-gray-400 text-sm'>{movie.release_date}</p>
            </button>

                    



          ))}



        </div>

      </div>

          {/*show price input */}

          <div className="mt-8">
  <label className="block text-sm font-medium mb-2">Show Price</label>
  <div className="inline-flex items-center gap-2 border border-gray-600 px-3 py-2 rounded-md">
    <p className="text-gray-400 text-sm">{currency}</p>
    <input min="0.01" step="0.01" type="number" value={showPrice} onChange={(e) => setShowPrice(e.target.value)} placeholder="Enter show price" className="outline-none"/>
  </div>
</div>

 {/*date and time */}

            
                <div className="mt-6">
                  <label className="block text-sm font-medium mb-2">Select Date and Time</label>
                  <div className="inline-flex gap-5 border border-gray-600 p-1 pl-3 rounded-lg">
                    <input type="datetime-local" value={dateTimeInput} onChange={(e) => setDateTimeInput(e.target.value)} className="outline-none rounded-md"/>
                    <button
                      onClick={handleDateTimeAdd} className="bg-primary/80 text-white px-3 py-2 text-sm rounded-lg hover:bg-primary cursor-pointer"
                   >
                      Add Time
                    </button>
                  </div>
                </div>


             {/* Display Selected Times */}
      {Object.keys(dateTimeSelection).length > 0 && (
  <div className="mt-6">
          <h2 className="mb-2">Selected Date-Time</h2>
         <ul className="space-y-3">
         {Object.entries(dateTimeSelection).map(([date, times]) => (
        <li key={date}>
              <div className="font-medium">{date}</div>
           <div className="flex flex-wrap gap-2 mt-1 text-sm">
            {times.map((time) => (
              <div
                key={time}
                className="border border-primary px-2 py-1 flex items-center rounded"
              >
                <span>{time}</span>
                <button type='button' onClick={() => handleRemoveTime(date, time)} title={`Remove ${time}`} aria-label={`Remove ${time}`} className='ml-2 text-red-400 hover:text-red-200 cursor-pointer'>
                  <DeleteIcon width={15}/>
                </button>
               </div>
             ))}
          </div>
          </li>
      ))}
            </ul>
  </div>
)}


<button onClick={handleSubmit} disabled={addingShow} className='bg-primary text-white px-8 py-2 mt-6 rounded hover:bg-primary/70 disabled:opacity-60 transition-all cursor-pointer'>
  {addingShow ? 'Adding Show...' : 'Add Show'}
</button>




    </>
  )
}

export default AddShows
