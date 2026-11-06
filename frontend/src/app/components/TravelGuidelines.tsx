'use client';

import { Plane } from 'lucide-react';

const accommodationBudgets = [
  {
    city: 'Mumbai',
    limits: [
      '1BHK / Single Room (1 person): ₹4,000 per night',
      '2BHK: ₹7,000 per night',
      '3BHK: ₹9,000 per night'
    ]
  },
  {
    city: 'Other Cities',
    limits: [
      '1BHK / Single Room (1 person): ₹3,000 per night',
      '2BHK: ₹5,500 per night',
      '3BHK: ₹7,500 per night'
    ]
  }
];

const guidelineSections = [
  {
    title: 'Accommodation Guidelines',
    items: [
      'Airbnb is the preferred accommodation platform for official travel. Employees are encouraged to book “Guest Favorite” or “Superhost” properties wherever feasible.',
      'For group travel, it is recommended that each employee has a separate bedroom, such as a 2BHK property for two employees.'
    ]
  },
  {
    title: 'Chennai & Coimbatore Travel Budget',
    items: [
      'Between chennai & Coimbatore, the maximum travel approval budget is Rs 5000/- (inclusive of accommodation & Travel/per day).'
    ]
  },
  {
    title: 'Incidental Allowance – Coimbatore Office Travel',
    items: [
      'Employees travelling to the Coimbatore office may claim a fixed incidental allowance of ₹5,000.',
      'Bills are not required for this allowance.',
      'Reimbursement will be processed upon submission of travel confirmation through email or the expense management system.'
    ]
  },
  {
    title: 'Food Expenses',
    items: [
      'Employees may claim reimbursement up to ₹750 per day for food expenses.',
      'This excludes partner, customer, or external entertainment expenses.'
    ]
  },
  {
    title: 'Preferred Travel Mode',
    items: [
      'For travel between Chennai and Bangalore, employees are encouraged to prefer train travel over flights wherever practical and feasible.'
    ]
  },
  {
    title: 'General Guidelines',
    items: [
      'Employees are expected to make reasonable, cost-effective, and business-appropriate travel decisions.',
      'Exceptions may be approved based on business requirements, availability, or special travel conditions.'
    ]
  }
];

export default function TravelGuidelines() {
  return (
    <div className="space-y-6">
      <div className="ui-panel bg-white rounded-lg shadow p-6">
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Plane className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tiered Per-Diem Travel Guidelines</h2>
            <p className="text-sm text-gray-600 mt-1">
              Official travel guidance for accommodation, food, incidental allowance, and travel mode.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GuidelineCard section={guidelineSections[0]} />

        <div className="ui-panel bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Suggested Accommodation Budget Limits</h3>
          <div className="space-y-5">
            {accommodationBudgets.map((budget) => (
              <div key={budget.city}>
                <h4 className="font-medium text-gray-900 mb-2">{budget.city}</h4>
                <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
                  {budget.limits.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {guidelineSections.slice(1).map((section) => (
          <GuidelineCard key={section.title} section={section} />
        ))}
      </div>
    </div>
  );
}

function GuidelineCard({ section }: { section: { title: string; items: string[] } }) {
  return (
    <div className="ui-panel bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{section.title}</h3>
      <ul className="space-y-3 text-sm text-gray-700 list-disc pl-5">
        {section.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
