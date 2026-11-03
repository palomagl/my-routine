import { useState, useEffect } from "react";
import { useAcaoUnica } from "@/hooks/useAcaoUnica";
import { Plus, Circle, CheckCircle2, Trash2, X, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tasksApi, Task } from "@/lib/db";
import { executar, carregar } from "@/lib/acoes";
import { useLocale } from "@/contexts/LocaleContext";
import type { TranslationKey } from "@/lib/translations";

const categories = ["Trabalho", "Saúde", "Estudos", "Bem-estar", "Casa", "Geral"];
const CATEGORY_KEYS: Record<string, TranslationKey> = {
  Trabalho: "categoryWork", Saúde: "categoryHealth", Estudos: "categoryStudy",
  "Bem-estar": "categoryWellbeing", Casa: "categoryHome", Geral: "categoryGeneral",
};

export function TasksWidget() {
  const { t } = useLocale();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newCategory, setNewCategory] = useState("Geral");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingCategory, setEditingCategory] = useState("");

  useEffect(() => {
    carregar(() => tasksApi.list(), "tarefas").then((lista) => lista && setTasks(lista));
  }, []);

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const salvo = await executar(
      () => tasksApi.update(id, { completed: !task.completed }),
      { erro: t("erroAoSalvar") }
    );
    // Só risca a tarefa na tela depois que o banco confirmou. Mostrar
    // concluída sem ter gravado é pior do que mostrar o erro.
    if (salvo === null) return;
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = async (id: string) => {
    const feito = await executar(() => tasksApi.delete(id), { erro: t("erroAoExcluir") });
    if (feito === null) return;
    setTasks(tasks.filter(t => t.id !== id));
  };

  // Uma criação por vez: Enter repetido ou toque duplo criava tarefas iguais.
  const { disparar: addTask, ocupado: adicionando } = useAcaoUnica(async () => {
    if (!newTask.trim()) return;
    const task = await executar(
      () => tasksApi.create({ title: newTask.trim(), completed: false, category: newCategory }),
      { erro: t("erroAoAdicionar") }
    );
    if (!task) return;
    setTasks([task, ...tasks]);
    setNewTask("");
    setNewCategory("Geral");
    setShowAddForm(false);
  });

  const startEditing = (task: Task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
    setEditingCategory(task.category);
  };

  const saveEdit = async () => {
    if (!editingTitle.trim() || !editingId) return;
    const salvo = await executar(
      () => tasksApi.update(editingId, { title: editingTitle.trim(), category: editingCategory }),
      { erro: t("erroAoSalvar") }
    );
    if (salvo === null) return;
    setTasks(tasks.map(t => t.id === editingId ? { ...t, title: editingTitle.trim(), category: editingCategory } : t));
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingCategory("");
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className="glass-card glass-card-hover rounded-xl p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-widget-tasks" />
            {t("tasksTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {completedCount} {t("tasksOf")} {tasks.length} {t("tasksCompletedOf")}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowAddForm(!showAddForm)} aria-label={showAddForm ? t("close") : t("tasksAdd")}>
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      <div className="h-1.5 bg-secondary rounded-full mb-4 overflow-hidden">
        <div 
          className="h-full bg-widget-tasks rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {showAddForm && (
        <div className="space-y-2 mb-4 p-3 bg-secondary/30 rounded-lg animate-fade-in">
          <Input
            placeholder={t("tasksPlaceholder")}
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            className="bg-background/50 border-border/50"
            autoFocus
          />
          <div className="flex gap-2">
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="bg-background/50 border-border/50 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{t(CATEGORY_KEYS[cat] ?? "categoryGeneral")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => addTask()} disabled={adicionando} size="sm" className="bg-widget-tasks hover:bg-widget-tasks/90">
              {t("tasksAdd")}
            </Button>
          </div>
        </div>
      )}

      {/* No celular a lista cresce com a página (rolar dentro de um card é ruim no dedo). */}
      <div className="space-y-2 lg:max-h-[280px] lg:overflow-y-auto lg:pr-2">
        {tasks.map((task) =>
          editingId === task.id ? (
            <div key={task.id} className="space-y-2 rounded-lg bg-secondary/60 p-3">
              <Input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="h-10 bg-background/70 border-border/50"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Select value={editingCategory} onValueChange={setEditingCategory}>
                  <SelectTrigger className="h-9 flex-1 bg-background/70 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{t(CATEGORY_KEYS[cat] ?? "categoryGeneral")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => {
                    deleteTask(task.id);
                    cancelEdit();
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("deleteTask")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button type="button" onClick={cancelEdit} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-background/70" aria-label={t("cancel")}>
                  <X className="h-4 w-4" />
                </button>
                <button type="button" onClick={saveEdit} className="grid h-9 w-9 place-items-center rounded-lg bg-widget-tasks text-white" aria-label={t("save")}>
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div
              key={task.id}
              className={`flex items-center gap-3 rounded-lg p-3 transition-all duration-200 ${
                task.completed ? "bg-secondary/30 opacity-60" : "bg-secondary/50 hover:bg-secondary"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                className="-m-1.5 shrink-0 p-1.5"
                aria-label={task.completed ? t("uncompleteTask") : t("completeTask")}
              >
                {task.completed ? <CheckCircle2 className="h-5 w-5 text-widget-tasks" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              {/* Tocar no nome abre a edição (onde também dá para excluir). */}
              <button
                type="button"
                onClick={() => startEditing(task)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                aria-label={`${t("editTask")}: ${task.title}`}
              >
                <span className={`min-w-0 text-sm ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
                <span className="shrink-0 rounded bg-background/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t(CATEGORY_KEYS[task.category] ?? "categoryGeneral")}
                </span>
              </button>
              <Pencil className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/60 lg:block" aria-hidden />
            </div>
          )
        )}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t("tasksEmpty")}
          </div>
        )}
      </div>
    </div>
  );
}
