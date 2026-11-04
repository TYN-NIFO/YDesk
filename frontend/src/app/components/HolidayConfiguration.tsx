'use client';

import { Dialog } from "./ui/WorkspaceUI";

import { useState } from 'react';
import {
    useGetHolidaysQuery,
    useCreateHolidayMutation,
    useUpdateHolidayMutation,
    useDeleteHolidayMutation,
} from '../../lib/api';
import toast from 'react-hot-toast';
import { Edit, Trash2, Calendar, Plus, X, AlertCircle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

export default function HolidaysManager() {
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [showModal, setShowModal] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<any | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [date, setDate] = useState('');
    const [isFlexi, setIsFlexi] = useState(false);

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [holidayToDelete, setHolidayToDelete] = useState<string | null>(null);

    // Queries & Mutations
    const { data: holidays, isLoading, refetch } = useGetHolidaysQuery({ year: selectedYear });
    const [createHoliday, { isLoading: isCreating }] = useCreateHolidayMutation();
    const [updateHoliday, { isLoading: isUpdating }] = useUpdateHolidayMutation();
    const [deleteHoliday, { isLoading: isDeleting }] = useDeleteHolidayMutation();

    const handleOpenModal = (holiday?: any) => {
        if (holiday) {
            setEditingHoliday(holiday);
            setName(holiday.name);
            setDate(new Date(holiday.date).toISOString().split('T')[0]);
            setIsFlexi(holiday.isFlexi);
        } else {
            setEditingHoliday(null);
            setName('');
            setDate('');
            setIsFlexi(false);
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingHoliday(null);
        setName('');
        setDate('');
        setIsFlexi(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            if (editingHoliday) {
                await updateHoliday({
                    id: editingHoliday._id,
                    name,
                    date,
                    isFlexi
                }).unwrap();
                toast.success('Holiday updated successfully!');
            } else {
                await createHoliday({
                    name,
                    date,
                    isFlexi
                }).unwrap();
                toast.success('Holiday created successfully!');
            }
            handleCloseModal();
            refetch();
        } catch (error: any) {
            toast.error(error?.data?.error || 'Failed to save holiday');
        }
    };

    const handleDeleteClick = (id: string) => {
        setHolidayToDelete(id);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!holidayToDelete) return;

        try {
            await deleteHoliday(holidayToDelete).unwrap();
            toast.success('Holiday deleted successfully');
            setShowDeleteModal(false);
            setHolidayToDelete(null);
            refetch();
        } catch (error: any) {
            toast.error(error?.data?.error || 'Failed to delete holiday');
            setShowDeleteModal(false);
            setHolidayToDelete(null);
        }
    };

    return (
        <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 flex justify-between items-center border-b border-gray-200">
                <div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                        <Calendar className="mr-2 h-5 w-5 text-gray-400" />
                        Holiday Management
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                        Configure normal and flexible holidays.
                    </p>
                </div>
                <div className="flex items-center space-x-4">
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="ui-control border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 bg-gray-50 border"
                    >
                        {Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map((year) => (
                            <option key={year} value={year}>
                                {year}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => handleOpenModal()}
                        className="ui-button ui-button-primary inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Holiday
                    </button>
                </div>
            </div>

            <div className="p-4">
                {isLoading ? (
                    <div className="flex justify-center py-10">
                        <LoadingSpinner />
                    </div>
                ) : holidays && holidays.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="ui-table min-w-full divide-y divide-gray-200 border border-gray-100 rounded-lg">
                            <thead className="ui-table-head bg-gray-50">
                                <tr>
                                    <th scope="col" className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th scope="col" className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Holiday Name
                                    </th>
                                    <th scope="col" className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {holidays.map((holiday: any) => (
                                    <tr key={holiday._id} className="hover:bg-gray-50">
                                        <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {new Date(holiday.date).toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </td>
                                        <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-l border-r border-gray-100">
                                            <div className="flex items-center space-x-2">
                                                <span>{holiday.name}</span>
                                                {holiday.isFlexi && (
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                                                        Flexi
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="ui-table-td px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleOpenModal(holiday)}
                                                className="text-blue-600 hover:text-blue-900 mr-4 transition-colors"
                                            >
                                                <Edit className="h-4 w-4 inline" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(holiday._id)}
                                                disabled={isDeleting}
                                                className="ui-icon-button text-red-600 hover:text-red-900 disabled:opacity-50 transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4 inline" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No holidays</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            No holidays configured for {selectedYear}. Get started by adding a new one.
                        </p>
                    </div>
                )}
            </div>

            {/* Holiday Create/Edit Modal */}
            {showModal && (
                <Dialog title={editingHoliday ? "Edit holiday" : "Add a holiday"} description="Update your organization’s shared calendar." onClose={handleCloseModal} busy={isCreating || isUpdating}>


                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Holiday Name</label>
                                <input aria-label="Holiday Name"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. New Year's Day"
                                    className="ui-control mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Date</label>
                                <input aria-label="Date"
                                    type="date"
                                    required
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="ui-control mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                            </div>

                            <div className="ui-detail-summary flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-900">Flexi Holiday</span>
                                    <span className="text-xs text-gray-500">Toggle if this is an optional holiday.</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsFlexi(!isFlexi)}
                                    className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isFlexi ? 'bg-purple-600' : 'bg-gray-200'
                                        }`}
                                >
                                    <span
                                        className={`pointer-events-none display-inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${isFlexi ? 'translate-x-5' : 'translate-x-0'
                                            }`}
                                    />
                                </button>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="ui-button ui-button-secondary bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating || isUpdating}
                                    className="ui-button ui-button-primary bg-blue-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                >
                                    {(isCreating || isUpdating) ? 'Saving...' : 'Save Holiday'}
                                </button>
                            </div>
                        </form>
                    </Dialog>
            )}
            {/* Delete Confirmation Modal */}
            {showDeleteModal && <Dialog title="Delete this holiday?" description="This change affects the shared organization calendar." onClose={() => setShowDeleteModal(false)} busy={isDeleting}><p className="text-sm text-gray-500 leading-relaxed">The holiday will be removed from the calendar. This cannot be undone.</p><div className="ui-form-actions mt-6"><button type="button" className="ui-button ui-button-secondary" disabled={isDeleting} onClick={() => setShowDeleteModal(false)}>Keep holiday</button><button type="button" className="ui-button ui-button-danger" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? 'Deleting…' : 'Delete holiday'}</button></div></Dialog>}
        </div>
    );
}
