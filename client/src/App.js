import {
  HashRouter,
  Routes,
  Route
} from "react-router-dom";
import Signup from './pages/Signup';
import About from './pages/About';
import Home from './pages/Home';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Signup />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
