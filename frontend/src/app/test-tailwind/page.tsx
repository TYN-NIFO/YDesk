'use client';

export default function TestTailwind() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="ui-panel max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Tailwind CSS Test</h1>
        
        <div className="space-y-4">
          <div className="bg-blue-500 text-white p-4 rounded">
            <p className="text-lg font-semibold">Blue Background</p>
            <p className="text-sm opacity-90">This should have a blue background</p>
          </div>
          
          <div className="bg-green-500 text-white p-4 rounded">
            <p className="text-lg font-semibold">Green Background</p>
            <p className="text-sm opacity-90">This should have a green background</p>
          </div>
          
          <div className="bg-red-500 text-white p-4 rounded">
            <p className="text-lg font-semibold">Red Background</p>
            <p className="text-sm opacity-90">This should have a red background</p>
          </div>
          
          <div className="bg-yellow-500 text-black p-4 rounded">
            <p className="text-lg font-semibold">Yellow Background</p>
            <p className="text-sm opacity-90">This should have a yellow background</p>
          </div>
        </div>
        
        <div className="mt-6">
          <button className="ui-button ui-button-primary bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Test Button
          </button>
        </div>
      </div>
    </div>
  );
}
