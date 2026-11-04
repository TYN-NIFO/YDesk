'use client';

import { useState, useEffect } from 'react';
import { useGetPolicyQuery, useUpdatePolicyMutation } from '@/lib/api';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeading, FormSection, Field } from './ui/WorkspaceUI';
import { Tags } from 'lucide-react';
import { categoryMaster, Category, SubCategory } from '@/lib/categoryMaster';

interface CategoryManagerProps {
  categories?: Category[];
  onSave?: (categories: Category[]) => void;
}

export default function CategoryManager({ categories = categoryMaster, onSave }: CategoryManagerProps) {
  const { data: policy } = useGetPolicyQuery({});
  const [savePolicy, { isLoading: saving }] = useUpdatePolicyMutation();
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  useEffect(() => { if (policy?.categoryDefinitions) setLocalCategories(policy.categoryDefinitions); }, [policy]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', subCategories: [{ name: '', itc: '' }] });

  const handleAddCategory = () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    const category: Category = {
      name: newCategory.name.trim(),
      subCategories: newCategory.subCategories.filter(sub => sub.name.trim())
    };

    setLocalCategories(prev => [...prev, category]);
    setNewCategory({ name: '', subCategories: [{ name: '', itc: '' }] });
    toast.success('Category added successfully');
  };

  const handleEditCategory = (name: string) => {
    setEditingId(name);
  };

  const handleSaveCategory = (oldName: string, updatedCategory: Partial<Category>) => {
    setLocalCategories(prev => 
      prev.map(cat => 
        cat.name === oldName 
          ? { ...cat, ...updatedCategory }
          : cat
      )
    );
    setEditingId(null);
    toast.success('Category updated successfully');
  };

  const handleDeleteCategory = (name: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      setLocalCategories(prev => prev.filter(cat => cat.name !== name));
      toast.success('Category deleted successfully');
    }
  };

  const handleAddSubCategory = (categoryName: string) => {
    setLocalCategories(prev => 
      prev.map(cat => 
        cat.name === categoryName 
          ? { ...cat, subCategories: [...cat.subCategories, { name: '', itc: '' }] }
          : cat
      )
    );
  };

  const handleUpdateSubCategory = (categoryName: string, index: number, field: 'name' | 'itc', value: string) => {
    setLocalCategories(prev => 
      prev.map(cat => 
        cat.name === categoryName 
          ? {
              ...cat,
              subCategories: cat.subCategories.map((sub, i) => 
                i === index ? { ...sub, [field]: value } : sub
              )
            }
          : cat
      )
    );
  };

  const handleRemoveSubCategory = (categoryName: string, index: number) => {
    setLocalCategories(prev => 
      prev.map(cat => 
        cat.name === categoryName 
          ? {
              ...cat,
              subCategories: cat.subCategories.filter((_, i) => i !== index)
            }
          : cat
      )
    );
  };

  const handleSaveAll = async () => {
    if (!policy || saving) return;
    if (!localCategories.length || localCategories.some(category => !category.name.trim() || !category.subCategories.length || category.subCategories.some(sub => !sub.name.trim()))) {
      toast.error('Every category needs a name and at least one named subcategory');
      return;
    }
    try {
      const { _id, createdAt, updatedAt, __v, updatedBy, ...data } = policy;
      await savePolicy({ ...data, maxFileSizeMB: Math.min(data.maxFileSizeMB || 4, 4), version: new Date().toISOString(), categoryDefinitions: localCategories, claimCategories: localCategories.map(category => category.name) }).unwrap();
      onSave?.(localCategories);
      toast.success('Categories saved');
    } catch (error: any) { toast.error(error.data?.error || 'Could not save categories'); }
  };

  return <div>
    <PageHeading title="Expense categories" description="Organize the categories and subcategories your team can claim against." icon={Tags} actions={<button type="button" className="ui-button ui-button-primary" onClick={handleSaveAll} disabled={saving || !policy}><Save size={16} />{saving ? 'Saving categories…' : 'Save all categories'}</button>} />
    <div className="ui-form-layout">
      <div className="ui-form-main">
        <FormSection title="Available categories" description="Edit names and subcategories, then save all changes to publish them.">
          <div className="space-y-5">{localCategories.map((category, categoryIndex) => <div className="ui-expense-item" key={categoryIndex}>
            <div className="flex items-end gap-3 mb-5"><div className="flex-1"><Field label="Category name" htmlFor={`category-${categoryIndex}`}><input id={`category-${categoryIndex}`} className="ui-control" value={category.name} onChange={event => setLocalCategories(previous => previous.map((entry, position) => position === categoryIndex ? { ...entry, name: event.target.value } : entry))} /></Field></div><button type="button" className="ui-icon-button" aria-label={`Delete category ${category.name}`} onClick={() => handleDeleteCategory(category.name)}><Trash2 size={17} /></button></div>
            <p className="ui-label mb-3">Subcategories</p><div className="space-y-3">{category.subCategories.map((sub, subIndex) => <div key={subIndex} className="flex items-start gap-2"><div className="grid sm:grid-cols-2 gap-3 flex-1"><input className="ui-control" aria-label={`Subcategory ${subIndex + 1} in ${category.name}`} value={sub.name} placeholder="Subcategory name" onChange={event => handleUpdateSubCategory(category.name, subIndex, 'name', event.target.value)} /><input className="ui-control" aria-label={`Tax credit note for ${sub.name || 'subcategory'}`} value={sub.itc || ''} placeholder="Tax credit note (optional)" onChange={event => handleUpdateSubCategory(category.name, subIndex, 'itc', event.target.value)} /></div><button type="button" className="ui-icon-button mt-1" aria-label={`Remove ${sub.name || 'subcategory'}`} onClick={() => handleRemoveSubCategory(category.name, subIndex)}><X size={15} /></button></div>)}</div><button type="button" className="ui-button ui-button-secondary mt-4" onClick={() => handleAddSubCategory(category.name)}><Plus size={14} />Add subcategory</button>
          </div>)}</div>
        </FormSection>
      </div>
      <aside className="ui-summary"><h2 className="ui-summary-heading">Add a category</h2><div className="ui-summary-content space-y-4">
        <Field label="Category name" htmlFor="new-category"><input id="new-category" className="ui-control" value={newCategory.name} onChange={event => setNewCategory(previous => ({ ...previous, name: event.target.value }))} placeholder="For example, Client travel" /></Field>
        <p className="ui-label">Subcategories</p>{newCategory.subCategories.map((sub, index) => <input className="ui-control" key={index} value={sub.name} aria-label={`New subcategory ${index + 1}`} placeholder="For example, Taxi" onChange={event => setNewCategory(previous => ({ ...previous, subCategories: previous.subCategories.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry) }))} />)}
        <button type="button" className="ui-back-link" onClick={() => setNewCategory(previous => ({ ...previous, subCategories: [...previous.subCategories, { name: '', itc: '' }] }))}><Plus size={14} />Another subcategory</button><button type="button" className="ui-button ui-button-secondary w-full" onClick={handleAddCategory}><Plus size={15} />Add category</button>
      </div><div className="ui-summary-help border-t border-gray-200"><h3>{localCategories.length} categories</h3><p>New categories stay in your draft until you select Save all categories.</p></div></aside>
    </div>
  </div>;
}
