# Credit Risk / Bad Debt Project

## Web dashboard

The `web/` directory contains Risk Observatory, an interactive dashboard for the three trained classifiers. It includes model comparison, customer inspection, approximate SHAP explanations, live what-if analysis, and score exports. See [web/README.md](web/README.md) for details and verification commands.

Run the web app locally from the project root (`Session 3`):

1. Install dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

2. Start Uvicorn:

   ```powershell
   python -m uvicorn web.app:app --host 127.0.0.1 --port 8000 --reload
   ```

3. Open **http://127.0.0.1:8000** in your browser and keep the terminal running.
4. Use the **Predict customer risk** form from the left panel, enter the 12 credit/risk values and optional Customer ID, then click **Predict customer risk**. You will see High/Low risk from all three models and a majority result.
5. Stop the server with **Ctrl+C**.

The application runs from your local repository. The page also includes 80 test examples with matched raw Customer IDs. The local server serves the saved model assets; predictions run in the browser without retraining. See [web/README.md](web/README.md) for virtual-environment steps and troubleshooting.

## Project Structure

- `data/raw/` - Original Excel source files.
- `data/processed/` - Selected modeling dataset; cleaning and training generate additional CSV outputs when run.
- `models/` - Saved best model and fitted comparison models.
- `notebooks/` - Exploratory analysis and modeling notebook.
- `src/` - Python execution scripts.
- `results/` - Model comparison tables and evaluation outputs.
- `reports/` - Final presentation and project PDF deliverables.
- `reports/figures/` - Generated charts and images.

## Run

From the project root:

```powershell
python src/run_task3.py
```

The runner executes `notebooks/Bad Debt.ipynb` from the project root so its relative data, model, and result paths remain consistent.

## Cleaning, EDA, and class balancing

- `notebooks/Data_Cleaning.ipynb` loads, merges, and cleans the data, then saves `data/processed/dataset_Cleaned.csv`.
- `notebooks/EDA.ipynb` loads that cleaned CSV and contains the exploratory analysis. Run the cleaning notebook before EDA.
- `notebooks/Bad Debt.ipynb` loads the supplied `dataset_SFM_Selected.csv` and performs feature importance and model comparison.
- Set `SAMPLING_METHOD` to `"oversampling"` or `"undersampling"` in Bad Debt. Only training rows are balanced; held-out test rows keep their original distribution. The default is random oversampling with seed 42.
- Records without a Good/Bad outcome are excluded from supervised modeling. All model feature values are imputed using training medians.
- Run the cleaning notebook separately when you need to regenerate the cleaned workbook data; `src/run_task3.py` executes the modeling notebook.

## Simplified modeling workflow

Run Bad Debt from top to bottom: load data, split, impute, balance training rows, fit models, evaluate, explain, and save. The target mapping is Good = 0 and Bad = 1. All feature groups use the same test rows. Selected Features and SFM Selected both use the columns in the supplied selected-feature CSV.

`models/best_model.joblib` contains the best model, imputer, feature names, and target mapping. `models/trained_models.joblib` contains the fitted models keyed by feature group and model name. SHAP explains 20 held-out examples using 30 training background rows.

The raw files contain numeric Customer IDs but no names, father names, or locations. The table and inspection drawer show IDs verified by matching all 12 original feature values to the raw workbooks. New assessments use credit/risk inputs only.

The prediction form opens from the left-panel **Predict customer risk** button; **Portfolio overview** returns to the dashboard without clearing inputs. Each feature shows a one-sentence explanation and its observed training-data minimum and maximum. Bureau fields without definitions in the column-description workbook are labeled as undocumented. Ranges describe the source data and do not enforce universal eligibility limits.

## Repository maintenance

The repository keeps the source workbooks, three notebooks, selected modeling dataset, saved models, model comparison results, final presentation, supporting figures, and complete dashboard. Unused intermediate datasets, the old tuning artifact, notebook checkpoint, and earlier presentation draft have been removed. The modeling notebook regenerates train/test CSV exports when run.

The root `.gitignore` excludes local environments, caches, notebook checkpoints, and local configuration. The large trained-model bundle uses Git LFS; install Git LFS before cloning to download it correctly.
