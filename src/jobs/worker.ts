import 'dotenv/config';
import './emailWorker'; // importing starts the Worker (BullMQ begins consuming on instantiation)

console.log('TaskFlow worker process started — listening for email jobs...');