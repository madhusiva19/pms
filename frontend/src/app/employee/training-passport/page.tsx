import TrainingPassport from "@/components/training/TrainingPassport";

export default function EmployeeTrainingPage() {
  return (
    <TrainingPassport
      role="Employee"
      sidebarName="Perera"
      dashboardPath="/login"
      userName="Perera A. K."
      designation="Air Exports Executive"
    />
  );
}